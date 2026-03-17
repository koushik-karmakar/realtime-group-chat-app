import { io } from "socket.io-client";

const backend = import.meta.env.VITE_CORS_BACKEND_ORIGIN
export function wsConnection() {
  return io(`${backend}`);
}
