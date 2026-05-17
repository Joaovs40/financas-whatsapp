import { startBot } from "./bot.js";
import { testDB } from "./db.js";

async function start() {
  await testDB();
  await startBot();
}

start();
