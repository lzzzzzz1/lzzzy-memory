import { cp, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "node_modules", "cesium", "Build", "Cesium");
const destination = join(process.cwd(), "public", "cesium");

try {
  await stat(source);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
} catch {
  // Dependencies are not installed yet; postinstall runs this script again.
}
