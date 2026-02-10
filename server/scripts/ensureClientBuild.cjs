const fs = require("fs");
const path = require("path");

const clientIndex = path.resolve(__dirname, "../../client/dist/index.html");

if (!fs.existsSync(clientIndex)) {
  console.error(
    "Client build missing. Run `npm run build` before starting the server in production."
  );
  process.exit(1);
}

console.log("Client build found. Skipping client build.");
