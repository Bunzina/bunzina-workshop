import { MongoClient, type Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'bunzina-workshop';

let client: MongoClient | null = null;
let database: Db | null = null;

export const getDb = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);

  return database;
};

export const closeDb = async (): Promise<void> => {
  await client?.close();

  client = null;
  database = null;
};
