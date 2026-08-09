import { VehiclesRepository } from './vehicles.repository';
import {
  ICreateVehicleRequest,
  IUpdateVehicleRequest,
  IVehicleResponse,
  IVehicleListResponse,
  IVehicle,
} from './vehicles.interface';
import { AppError } from '../../utils/appError';
import { uploadToCloudinary } from '../../utils/cloudinary';
import { openSearchClient } from '../../config/opensearch';
import { VehiclesCache } from './vehicles.cache';
import { Client } from '@opensearch-project/opensearch';

export class VehiclesService {
  private vehiclesRepository: VehiclesRepository;
  private vehiclesCache: VehiclesCache;
  private openSearch: Client;

  constructor(vehiclesRepository: VehiclesRepository, vehiclesCache: VehiclesCache) {
    this.vehiclesRepository = vehiclesRepository;
    this.vehiclesCache = vehiclesCache;
    this.openSearch = openSearchClient;
  }

  /**
   * Ensures the OpenSearch index exists with proper mappings.
   */
  private async ensureIndexExists(): Promise<void> {
    try {
      const { body: exists } = await this.openSearch.indices.exists({ index: 'vehicles_index' });
      if (!exists) {
        await this.openSearch.indices.create({
          index: 'vehicles_index',
          body: {
            mappings: {
              properties: {
                id: { type: 'integer' },
                name: { type: 'text' },
                plate_number: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' },
                  },
                },
                category: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' },
                  },
                },
                daily_rate: { type: 'float' },
                created_at: { type: 'date' },
              },
            },
          },
        });
      }
    } catch (err) {
      console.error('Failed to ensure OpenSearch index exists:', err);
    }
  }

  /**
   * Helper to hydrate ZSET index caches from PostgreSQL
   */
  private async hydrateZsetIndex(category?: string): Promise<string> {
    const key = category ? `vehicles:index:${category.toLowerCase()}` : 'vehicles:index';

    const exists = await this.vehiclesCache.indexExists(key);
    if (!exists) {
      const activeVehicles = await this.vehiclesRepository.findActiveIds(category);
      if (activeVehicles.length > 0) {
        const scoreMembers = activeVehicles.map(v => ({
          score: v.id,
          value: v.id.toString(),
        }));
        await this.vehiclesCache.zAddManyIndex(key, scoreMembers);
        await this.vehiclesCache.zExpire(key, 3600); // 1 hour expiration
      }
    }
    return key;
  }

  /**
   * Stitch vehicle details using individual vehicle:{id} caches
   */
  private async stitchVehicleDetails(ids: number[]): Promise<IVehicleResponse[]> {
    if (ids.length === 0) return [];

    const cachedData = await this.vehiclesCache.getManyVehicles(ids);

    const stitchedList: IVehicleResponse[] = [];
    const missingIds: number[] = [];
    const missingIndicesMap: { [id: number]: number } = {};

    ids.forEach((id, index) => {
      const cached = cachedData[index];
      if (cached) {
        stitchedList.push(cached);
      } else {
        missingIds.push(id);
        missingIndicesMap[id] = stitchedList.length;
        stitchedList.push(null as unknown as IVehicleResponse);
      }
    });

    if (missingIds.length > 0) {
      const dbVehicles = await this.vehiclesRepository.findManyByIds(missingIds);

      for (const vehicle of dbVehicles) {
        const responseData: IVehicleResponse = {
          id: vehicle.id,
          name: vehicle.name,
          plate_number: vehicle.plate_number,
          category: vehicle.category,
          daily_rate: Number(vehicle.daily_rate),
          photo_path: vehicle.photo_path,
          created_at: vehicle.created_at,
          updated_at: vehicle.updated_at,
        };

        await this.vehiclesCache.setVehicle(vehicle.id, responseData);

        const indexToStitch = missingIndicesMap[vehicle.id];
        stitchedList[indexToStitch] = responseData;
      }
    }

    return stitchedList.filter(item => item !== null);
  }

  public async createVehicle(
    payload: ICreateVehicleRequest,
    file: Express.Multer.File | null,
  ): Promise<IVehicleResponse> {
    const existingVehicle = await this.vehiclesRepository.findByPlateNumber(payload.plate_number);
    if (existingVehicle) {
      throw new AppError(`Vehicle with plate number ${payload.plate_number} already exists`, 409);
    }

    let photoUrl: string | null = null;
    if (file) {
      try {
        const uploadResult = await uploadToCloudinary(file.buffer, 'vehicles');
        photoUrl = uploadResult.url;
      } catch (uploadErr) {
        console.error('Failed to upload photo to Cloudinary:', uploadErr);
        throw new AppError('Failed to upload vehicle photo', 500);
      }
    }

    const vehicle = await this.vehiclesRepository.create({
      name: payload.name,
      plate_number: payload.plate_number.toUpperCase(),
      category: payload.category,
      daily_rate: payload.daily_rate,
      photo_path: photoUrl,
    });

    const responseData: IVehicleResponse = {
      id: vehicle.id,
      name: vehicle.name,
      plate_number: vehicle.plate_number,
      category: vehicle.category,
      daily_rate: Number(vehicle.daily_rate),
      photo_path: vehicle.photo_path,
      created_at: vehicle.created_at,
      updated_at: vehicle.updated_at,
    };

    try {
      await this.vehiclesCache.setVehicle(vehicle.id, responseData);
    } catch (redisErr) {
      console.error('Failed to set details cache in Redis:', redisErr);
    }

    try {
      const score = vehicle.id;
      if (await this.vehiclesCache.indexExists('vehicles:index')) {
        await this.vehiclesCache.zAddIndex('vehicles:index', score, vehicle.id.toString());
      }
      const categoryKey = `vehicles:index:${vehicle.category.toLowerCase()}`;
      if (await this.vehiclesCache.indexExists(categoryKey)) {
        await this.vehiclesCache.zAddIndex(categoryKey, score, vehicle.id.toString());
      }
    } catch (redisErr) {
      console.error('Failed to update Redis ZSET index:', redisErr);
    }

    await this.ensureIndexExists();
    try {
      await this.openSearch.index({
        index: 'vehicles_index',
        id: vehicle.id.toString(),
        body: {
          id: vehicle.id,
          name: vehicle.name,
          plate_number: vehicle.plate_number,
          category: vehicle.category,
          daily_rate: Number(vehicle.daily_rate),
          created_at: vehicle.created_at,
        },
      });
    } catch (openSearchErr) {
      console.error('Failed to index vehicle in OpenSearch:', openSearchErr);
    }

    return responseData;
  }

  public async getVehicleById(id: number): Promise<IVehicleResponse> {
    try {
      const cached = await this.vehiclesCache.getVehicle(id);
      if (cached) {
        return cached;
      }
    } catch (redisErr) {
      console.error('Failed to query Redis details cache:', redisErr);
    }

    const vehicle = await this.vehiclesRepository.findById(id);
    if (!vehicle) {
      throw new AppError(`Vehicle with ID ${id} not found`, 404);
    }

    const responseData: IVehicleResponse = {
      id: vehicle.id,
      name: vehicle.name,
      plate_number: vehicle.plate_number,
      category: vehicle.category,
      daily_rate: Number(vehicle.daily_rate),
      photo_path: vehicle.photo_path,
      created_at: vehicle.created_at,
      updated_at: vehicle.updated_at,
    };

    try {
      await this.vehiclesCache.setVehicle(id, responseData);
    } catch (redisErr) {
      console.error('Failed to set details cache in Redis:', redisErr);
    }

    return responseData;
  }

  public async getVehiclesList(filters: {
    limit?: number;
    cursor?: number;
    category?: string;
    search?: string;
  }): Promise<IVehicleListResponse> {
    const limit = Number(filters.limit) || 10;
    const fetchLimit = limit + 1;
    const category = filters.category;
    const search = filters.search;
    const cursor = filters.cursor ? Number(filters.cursor) : undefined;

    let vehicleIds: number[] = [];
    let isFallback = false;
    let fallbackVehicles: IVehicleResponse[] = [];

    if (search) {
      await this.ensureIndexExists();
      try {
        const mustQueries: object[] = [
          {
            multi_match: {
              query: search,
              fields: ['name^2', 'category', 'plate_number'],
              fuzziness: 'AUTO',
            },
          },
        ];

        if (category) {
          mustQueries.push({ term: { 'category.keyword': category.toLowerCase() } });
        }

        const { body } = await this.openSearch.search({
          index: 'vehicles_index',
          body: {
            query: {
              bool: {
                must: mustQueries,
              },
            },
            size: fetchLimit * 2,
          },
        });

        const hits = body.hits.hits as { _source: { id: string | number } }[];
        let ids = hits.map((hit) => Number(hit._source.id));

        if (cursor) {
          const cursorIndex = ids.indexOf(cursor);
          if (cursorIndex !== -1) {
            ids = ids.slice(cursorIndex + 1);
          }
        }
        vehicleIds = ids.slice(0, fetchLimit);
      } catch (openSearchErr) {
        console.error('OpenSearch query failed, falling back to PostgreSQL:', openSearchErr);
        isFallback = true;
        const dbVehicles = await this.vehiclesRepository.findPaginatedFromDb(fetchLimit, cursor, category);
        fallbackVehicles = dbVehicles.map(v => ({
          id: v.id,
          name: v.name,
          plate_number: v.plate_number,
          category: v.category,
          daily_rate: Number(v.daily_rate),
          photo_path: v.photo_path,
          created_at: v.created_at,
          updated_at: v.updated_at,
        }));
      }
    } else {
      try {
        const indexKey = await this.hydrateZsetIndex(category);

        let zsetIds: string[] = [];
        if (cursor) {
          zsetIds = await this.vehiclesCache.zRangeQuery(indexKey, cursor - 1, '-inf', fetchLimit);
        } else {
          zsetIds = await this.vehiclesCache.zRangeQuery(indexKey, '+inf', '-inf', fetchLimit);
        }

        vehicleIds = zsetIds.map(id => Number(id));
      } catch (redisErr) {
        console.error('Redis ZSET query failed, falling back to PostgreSQL:', redisErr);
        isFallback = true;
        const dbVehicles = await this.vehiclesRepository.findPaginatedFromDb(fetchLimit, cursor, category);
        fallbackVehicles = dbVehicles.map(v => ({
          id: v.id,
          name: v.name,
          plate_number: v.plate_number,
          category: v.category,
          daily_rate: Number(v.daily_rate),
          photo_path: v.photo_path,
          created_at: v.created_at,
          updated_at: v.updated_at,
        }));
      }
    }

    let vehiclesList: IVehicleResponse[] = [];
    if (isFallback) {
      vehiclesList = fallbackVehicles;
    } else {
      vehiclesList = await this.stitchVehicleDetails(vehicleIds);
    }

    let nextCursor: number | null = null;
    if (vehiclesList.length > limit) {
      vehiclesList = vehiclesList.slice(0, limit);
      nextCursor = vehiclesList[vehiclesList.length - 1].id;
    }

    return {
      vehicles: vehiclesList,
      nextCursor,
    };
  }

  public async updateVehicle(
    id: number,
    payload: IUpdateVehicleRequest,
    file: Express.Multer.File | null,
  ): Promise<IVehicleResponse> {
    const existingVehicle = await this.vehiclesRepository.findById(id);
    if (!existingVehicle) {
      throw new AppError(`Vehicle with ID ${id} not found`, 404);
    }

    if (payload.plate_number && payload.plate_number.toUpperCase() !== existingVehicle.plate_number) {
      const duplicate = await this.vehiclesRepository.findByPlateNumber(payload.plate_number);
      if (duplicate && duplicate.id !== id) {
        throw new AppError(`Vehicle with plate number ${payload.plate_number} already exists`, 409);
      }
    }

    let photoUrl = existingVehicle.photo_path;
    if (file) {
      try {
        const uploadResult = await uploadToCloudinary(file.buffer, 'vehicles');
        photoUrl = uploadResult.url;
      } catch (uploadErr) {
        console.error('Failed to upload photo to Cloudinary:', uploadErr);
        throw new AppError('Failed to upload vehicle photo', 500);
      }
    }

    const updateData: Partial<IVehicle> = {};
    if (payload.name) updateData.name = payload.name;
    if (payload.plate_number) updateData.plate_number = payload.plate_number.toUpperCase();
    if (payload.category) updateData.category = payload.category;
    if (payload.daily_rate !== undefined) updateData.daily_rate = payload.daily_rate;
    if (photoUrl !== existingVehicle.photo_path) updateData.photo_path = photoUrl;

    const updatedVehicle = await this.vehiclesRepository.update(id, updateData);

    const responseData: IVehicleResponse = {
      id: updatedVehicle.id,
      name: updatedVehicle.name,
      plate_number: updatedVehicle.plate_number,
      category: updatedVehicle.category,
      daily_rate: Number(updatedVehicle.daily_rate),
      photo_path: updatedVehicle.photo_path,
      created_at: updatedVehicle.created_at,
      updated_at: updatedVehicle.updated_at,
    };

    try {
      await this.vehiclesCache.setVehicle(id, responseData);

      if (payload.category && payload.category.toLowerCase() !== existingVehicle.category.toLowerCase()) {
        const score = updatedVehicle.id;
        const oldCategoryKey = `vehicles:index:${existingVehicle.category.toLowerCase()}`;
        const newCategoryKey = `vehicles:index:${payload.category.toLowerCase()}`;

        if (await this.vehiclesCache.indexExists(oldCategoryKey)) {
          await this.vehiclesCache.zRemIndex(oldCategoryKey, id.toString());
        }

        if (await this.vehiclesCache.indexExists(newCategoryKey)) {
          await this.vehiclesCache.zAddIndex(newCategoryKey, score, id.toString());
        }
      }
    } catch (redisErr) {
      console.error('Failed to update Redis cache on vehicle update:', redisErr);
    }

    await this.ensureIndexExists();
    try {
      await this.openSearch.index({
        index: 'vehicles_index',
        id: id.toString(),
        body: {
          id: updatedVehicle.id,
          name: updatedVehicle.name,
          plate_number: updatedVehicle.plate_number,
          category: updatedVehicle.category,
          daily_rate: Number(updatedVehicle.daily_rate),
          created_at: updatedVehicle.created_at,
        },
      });
    } catch (openSearchErr) {
      console.error('Failed to update vehicle in OpenSearch:', openSearchErr);
    }

    return responseData;
  }

  public async deleteVehicle(id: number): Promise<void> {
    const existingVehicle = await this.vehiclesRepository.findById(id);
    if (!existingVehicle) {
      throw new AppError(`Vehicle with ID ${id} not found`, 404);
    }

    await this.vehiclesRepository.softDelete(id);

    try {
      await this.vehiclesCache.deleteVehicle(id);

      if (await this.vehiclesCache.indexExists('vehicles:index')) {
        await this.vehiclesCache.zRemIndex('vehicles:index', id.toString());
      }

      const categoryKey = `vehicles:index:${existingVehicle.category.toLowerCase()}`;
      if (await this.vehiclesCache.indexExists(categoryKey)) {
        await this.vehiclesCache.zRemIndex(categoryKey, id.toString());
      }
    } catch (redisErr) {
      console.error('Failed to purge vehicle from Redis cache:', redisErr);
    }

    try {
      await this.openSearch.delete({
        index: 'vehicles_index',
        id: id.toString(),
      });
    } catch (openSearchErr) {
      console.error('Failed to delete vehicle from OpenSearch:', openSearchErr);
    }
  }
}
