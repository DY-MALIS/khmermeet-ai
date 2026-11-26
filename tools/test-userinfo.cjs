// Some restricted Windows test environments fail in os.userInfo() before tsx
// loads any tests. Leave normal environments untouched.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const os = require("node:os");
try {
  os.userInfo();
} catch {
  os.userInfo = () => ({ username: "test", uid: 0, gid: 0, shell: "", homedir: process.cwd() });
}
