import { VehiclesRepository } from './vehicles.repository';
import { ICreateVehicleRequest, IVehicleResponse } from './vehicles.interface';
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
                    keyword: { type: 'keyword' }
                  }
                },
                category: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' }
                  }
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
    
    // Check if key exists first
    const exists = await this.vehiclesCache.indexExists(key);
    if (!exists) {
      const activeVehicles = await this.vehiclesRepository.findActiveIds(category);
      if (activeVehicles.length > 0) {
        const scoreMembers = activeVehicles.map(v => ({
          score: new Date(v.created_at).getTime(),
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

    // 1. Fetch from Redis Cache using Multi-Get
    const cachedData = await this.vehiclesCache.getManyVehicles(ids);
    
    const stitchedList: IVehicleResponse[] = [];
    const missingIds: number[] = [];
    const missingIndicesMap: { [id: number]: number } = {};

    // 2. Map hits and identify misses
    ids.forEach((id, index) => {
      const cached = cachedData[index];
      if (cached) {
        stitchedList.push(cached);
      } else {
        missingIds.push(id);
        missingIndicesMap[id] = stitchedList.length;
        // Push null placeholder to maintain ordering
        stitchedList.push(null as unknown as IVehicleResponse);
      }
    });

    // 3. Hydrate misses from PostgreSQL database
    if (missingIds.length > 0) {
      const dbVehicles = await this.vehiclesRepository.findManyByIds(missingIds);
      
      // Save missing to Redis and stitch back into the list
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

    // Filter out any placeholders that might have failed db lookups (e.g. if deleted in parallel)
    return stitchedList.filter(item => item !== null);
  }

  public async createVehicle(
    payload: ICreateVehicleRequest,
    file: Express.Multer.File | null,
  ): Promise<IVehicleResponse> {
    // 1. Check if plate number is already registered
    const existingVehicle = await this.vehiclesRepository.findByPlateNumber(payload.plate_number);
    if (existingVehicle) {
      throw new AppError(`Vehicle with plate number ${payload.plate_number} already exists`, 409);
    }

    // 2. Upload photo to Cloudinary (after validation passes)
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

    // 3. Create vehicle in PostgreSQL
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

    // 4. Store details cache in Redis
    try {
      await this.vehiclesCache.setVehicle(vehicle.id, responseData);
    } catch (redisErr) {
      console.error('Failed to set details cache in Redis:', redisErr);
    }

    // 5. Update ZSET Indexes in Redis
    try {
      const score = new Date(vehicle.created_at).getTime();
      await this.vehiclesCache.zAddIndex('vehicles:index', score, vehicle.id.toString());
      await this.vehiclesCache.zAddIndex(`vehicles:index:${vehicle.category.toLowerCase()}`, score, vehicle.id.toString());
    } catch (redisErr) {
      console.error('Failed to update Redis ZSET index:', redisErr);
    }

    // 6. Invalidate Redis Caches
    try {
      await this.vehiclesCache.deleteIndex('vehicles:list');
      const keys = await this.vehiclesCache.findKeys('vehicles:list*');
      await this.vehiclesCache.deleteManyIndices(keys);
    } catch (redisErr) {
      console.error('Failed to invalidate Redis cache:', redisErr);
    }

    // 7. Index in OpenSearch
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
    // 1. Try fetching from Redis cache
    try {
      const cached = await this.vehiclesCache.getVehicle(id);
      if (cached) {
        return cached;
      }
    } catch (redisErr) {
      console.error('Failed to query Redis details cache:', redisErr);
    }

    // 2. Fetch from PostgreSQL
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

    // 3. Save to Redis details cache (1 hour expiry)
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
  }): Promise<IVehicleResponse[]> {
    const limit = Number(filters.limit) || 10;
    const category = filters.category;
    const search = filters.search;
    const cursor = filters.cursor ? Number(filters.cursor) : undefined;

    let vehicleIds: number[] = [];

    // Case 1: Full-Text Search requested -> Route to OpenSearch (match name, category, and plate number)
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
            size: limit * 2, // Load slightly more to filter/paginate manually
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
        vehicleIds = ids.slice(0, limit);
      } catch (openSearchErr) {
        console.error('OpenSearch query failed, falling back to PostgreSQL:', openSearchErr);
        // Fallback to database query if OpenSearch is down
        const fallbackVehicles = await this.vehiclesRepository.findPaginatedFromDb(limit, cursor, category);
        return fallbackVehicles.map(v => ({
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
      // Case 2: General paginated query -> Route to Redis ZSET Cache
      try {
        const indexKey = await this.hydrateZsetIndex(category);

        let zsetIds: string[] = [];
        if (cursor) {
          // Look up cursor vehicle to get its created_at timestamp score
          const cursorVehicle = await this.getVehicleById(cursor);
          const cursorScore = new Date(cursorVehicle.created_at).getTime();

          // Fetch items with score < cursorScore (newer items have higher timestamps)
          zsetIds = await this.vehiclesCache.zRangeQuery(indexKey, cursorScore - 1, '-inf', limit);
        } else {
          // Fetch from the top of the Sorted Set
          zsetIds = await this.vehiclesCache.zRangeQuery(indexKey, '+inf', '-inf', limit);
        }

        vehicleIds = zsetIds.map(id => Number(id));
      } catch (redisErr) {
        console.error('Redis ZSET query failed, falling back to PostgreSQL:', redisErr);
        // Fallback to PostgreSQL
        const fallbackVehicles = await this.vehiclesRepository.findPaginatedFromDb(limit, cursor, category);
        return fallbackVehicles.map(v => ({
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

    // Stitch details for the resolved vehicle IDs
    return this.stitchVehicleDetails(vehicleIds);
  }
}
