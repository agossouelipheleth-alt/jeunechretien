// Génère la valeur à mettre dans ADMIN_PASSWORD_HASH (.env).
// Usage : node scripts/hash-password.mjs "le-mot-de-passe-choisi"
import { scryptSync, randomBytes } from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.error("Usage : node scripts/hash-password.mjs \"le-mot-de-passe\"");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = scryptSync(password, salt, 64);
const hash = `${salt.toString("hex")}:${derived.toString("hex")}`;

console.log("\nAjoute cette ligne à ton fichier .env :\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
