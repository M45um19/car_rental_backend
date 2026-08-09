import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerPath = path.join(__dirname, '../docs/swagger.json');
export const swaggerSpec = JSON.parse(fs.readFileSync(swaggerPath, 'utf8'));

export default swaggerSpec;
