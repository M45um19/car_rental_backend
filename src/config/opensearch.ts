import { Client } from '@opensearch-project/opensearch';
import { env } from './env';

export const openSearchClient = new Client({
  node: env.opensearch.node,
});

export default openSearchClient;
