import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lsresult';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose | null> | null;
}

const getGlobalCache = (): MongooseCache => {
  const g = global as { __mongooseCache?: MongooseCache };
  if (!g.__mongooseCache) {
    g.__mongooseCache = { conn: null, promise: null };
  }
  return g.__mongooseCache;
};

async function dbConnect(): Promise<typeof mongoose | null> {
  const cached = getGlobalCache();

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    console.log('[MongoDB] Attempting to connect to:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts)
      .then((m) => {
        console.log('[MongoDB] Connected successfully');
        return m;
      })
      .catch((err: Error) => {
        console.error('[MongoDB] Connection failed:', err.message);
        cached.promise = null;
        return null;
      });
  }
  
  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    console.error('[MongoDB] Connection error:', err);
    return null;
  }
}

export default dbConnect;
