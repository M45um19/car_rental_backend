import { uuidv7 } from 'uuidv7';

/**
 * Generates an RFC 9562 compliant UUIDv7 using the dedicated npm package.
 */
export const generateUuidV7 = (): string => {
  return uuidv7();
};
