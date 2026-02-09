const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const clientIndex = path.resolve(__dirname, "../../client/dist/index.html");

if (!fs.existsSync(clientIndex)) {
  console.log("Client build missing. Building client...");
  execSync("npm run build --prefix ../client", { stdio: "inherit" });
} else {
  console.log("Client build found. Skipping client build.");
}
