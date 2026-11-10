import { seedCatalog } from "../lib/catalog-seed";

seedCatalog(process.argv.includes("--reset"));
console.log("Catalog seeded. Stock levels restored to the seed file if --reset was passed.");
