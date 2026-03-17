import dotenv from "dotenv";
dotenv.config({ path: ".env" });
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
const nodeserver = createServer(app);
const io = new Server(nodeserver, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
});

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || "12345";

let groupData = {
  host: null,
  hostUsername: null,
  users: new Map(),
  typingUsers: new Set(),
  joinRequests: new Map(),
};

io.on("connection", (socket) => {
  socket.on("joinWithPassword", ({ username, password }) => {
    if (!username) {
      socket.emit("join:error", { message: "Username is required" });
      return;
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      socket.emit("join:error", {
        message: "Username must be at least 3 characters",
      });
      return;
    }

    const validPattern = /^[a-zA-Z0-9]+$/;
    if (!validPattern.test(cleanUsername)) {
      socket.emit("join:error", {
        message: "Username can only contain letters and numbers",
      });
      return;
    }

    const existingUser = Array.from(groupData.users.values()).find(
      (u) => u.username.toLowerCase() === cleanUsername.toLowerCase(),
    );
    if (existingUser) {
      socket.emit("join:error", { message: "Username already taken" });
      return;
    }

    if (groupData.host) {
      if (password === DEFAULT_PASSWORD) {
        socket.username = cleanUsername;
        groupData.users.set(socket.id, {
          username: cleanUsername,
          isHost: false,
        });

        socket.emit("join:success", {
          username: cleanUsername,
          isHost: false,
          message: "You joined the chat!",
        });

        io.emit(
          "users:update",
          Array.from(groupData.users.values()).map((u) => u.username),
        );

        socket.broadcast.emit("message:new", {
          id: Date.now(),
          text: `${cleanUsername} joined the chat`,
          username: "System",
          sender: "system",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });

        const hostSocket = io.sockets.sockets.get(groupData.host);
        if (hostSocket) {
          hostSocket.emit("join:alert", {
            username: cleanUsername,
            message: `${cleanUsername} joined the group with password`,
            type: "success",
          });
        }
      } else if (!password || password.trim() === "") {
        socket.username = cleanUsername;
        socket.isPending = true;

        const request = {
          socketId: socket.id,
          username: cleanUsername,
          timestamp: Date.now(),
        };

        groupData.joinRequests.set(socket.id, request);

        const hostSocket = io.sockets.sockets.get(groupData.host);
        if (hostSocket) {
          hostSocket.emit("join:request", request);
        }

        socket.emit("join:pending", {
          username: cleanUsername,
          message: "Join request sent to host. Waiting for approval...",
        });
      } else {
        socket.username = cleanUsername;

        const hostSocket = io.sockets.sockets.get(groupData.host);
        if (hostSocket) {
          hostSocket.emit("join:alert", {
            username: cleanUsername,
            message: `${cleanUsername} tried to join with wrong password`,
            type: "warning",
          });
        }

        socket.emit("join:error", {
          message: "Wrong password. Join request sent to host.",
        });
      }
    } else {
      if (!password || password.trim() === "") {
        socket.emit("join:error", {
          message: "Password is required to create a group",
        });
        return;
      }

      if (password !== DEFAULT_PASSWORD) {
        socket.emit("join:error", {
          message: `Incorrect password!`,
        });
        return;
      }

      socket.username = cleanUsername;
      socket.isHost = true;
      groupData.host = socket.id;
      groupData.hostUsername = cleanUsername;
      groupData.users.set(socket.id, {
        username: cleanUsername,
        isHost: true,
      });

      socket.emit("join:success", {
        username: cleanUsername,
        isHost: true,
        message: "You created the group as host!",
      });

      io.emit(
        "users:update",
        Array.from(groupData.users.values()).map((u) => u.username),
      );
    }
  });

  socket.on("handleJoinRequest", ({ socketId, action }) => {
    if (!socket.isHost || socket.id !== groupData.host) {
      return;
    }

    const request = groupData.joinRequests.get(socketId);
    if (!request) {
      return;
    }

    const userSocket = io.sockets.sockets.get(socketId);

    if (action === "approve") {
      groupData.joinRequests.delete(socketId);

      if (userSocket) {
        userSocket.username = request.username;
        userSocket.isPending = false;
        groupData.users.set(socketId, {
          username: request.username,
          isHost: false,
        });

        userSocket.emit("join:success", {
          username: request.username,
          isHost: false,
          message: "Host approved your join request!",
        });

        io.emit(
          "users:update",
          Array.from(groupData.users.values()).map((u) => u.username),
        );

        userSocket.broadcast.emit("message:new", {
          id: Date.now(),
          text: `${request.username} joined the chat (approved by host)`,
          username: "System",
          sender: "system",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });

        socket.emit("request:handled", { socketId, action: "approved" });
      }
    } else if (action === "reject") {
      groupData.joinRequests.delete(socketId);

      if (userSocket) {
        userSocket.emit("join:rejected", {
          hostUsername: groupData.hostUsername,
          message: "Host rejected your join request",
        });
        setTimeout(() => {
          userSocket.disconnect();
        }, 100);
      }

      socket.emit("request:handled", { socketId, action: "rejected" });
      socket.emit("message:new", {
        id: Date.now(),
        text: `You rejected ${request.username}'s join request`,
        username: "System",
        sender: "system",
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
  });

  socket.on("getGroupStatus", () => {
    const status = {
      hasHost: !!groupData.host,
      hostUsername: groupData.hostUsername,
    };
    socket.emit("group:status", status);
  });

  socket.on("leaveChat", () => {
    socket.disconnect();
  });

  socket.on("typing", () => {
    if (!socket.username || socket.isPending) return;

    groupData.typingUsers.add(socket.username);
    socket.broadcast.emit("typing:update", Array.from(groupData.typingUsers));
  });

  socket.on("stopTyping", () => {
    if (!socket.username) return;

    groupData.typingUsers.delete(socket.username);
    socket.broadcast.emit("typing:update", Array.from(groupData.typingUsers));
  });

  socket.on("sendMessage", (message) => {
    if (!message.username || socket.isPending) return;

    io.emit("message:new", {
      ...message,
      sender: socket.id,
    });
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      groupData.typingUsers.delete(socket.username);
    }

    if (socket.id === groupData.host) {
      io.emit("group:reset", {
        message: "Host disconnected. Group is closed.",
        hostUsername: groupData.hostUsername,
      });

      groupData = {
        host: null,
        hostUsername: null,
        users: new Map(),
        typingUsers: new Set(),
        joinRequests: new Map(),
      };
    } else {
      groupData.users.delete(socket.id);
      groupData.joinRequests.delete(socket.id);

      if (groupData.host) {
        io.emit(
          "users:update",
          Array.from(groupData.users.values()).map((u) => u.username),
        );
      }

      if (socket.username && !socket.isPending) {
        io.emit("message:new", {
          id: Date.now(),
          text: `${socket.username} left the chat`,
          username: "System",
          sender: "system",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      }
    }

    socket.broadcast.emit("typing:update", Array.from(groupData.typingUsers));
  });

  socket.on("heartbeat", () => {
    socket.emit("heartbeat:ack");
  });
});

const port = process.env.PORT || 3000;
nodeserver.listen(port, () => {
  console.log(`Server running at port: ${port}`);
});
