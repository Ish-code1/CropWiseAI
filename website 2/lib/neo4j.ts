
import neo4j, { type Driver } from 'neo4j-driver';


const uri = process.env.NEO4J_URI || 'neo4j+s://placeholder.databases.neo4j.io';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

// Singleton instance
let driver: neo4j.Driver | null = null;

export function getNeo4jDriver() {
  if (!driver) {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export async function closeNeo4jDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
