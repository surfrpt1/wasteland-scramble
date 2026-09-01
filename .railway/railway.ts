import { defineRailway, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  const web = service("wasteland-scramble-v2", {
    build: "npm run build",
    start: "node server.mjs",
    healthcheck: "/",
  });

  return project("wasteland-scramble-v2", {
    resources: [web],
  });
});