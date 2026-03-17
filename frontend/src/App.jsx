import { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  Smile,
  MoreVertical,
  Check,
  CheckCheck,
  Users,
  Lock,
  Shield,
  UserPlus,
  X,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { wsConnection } from "./ws.jsx";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isUsernameSet, setIsUsernameSet] = useState(false);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [groupExists, setGroupExists] = useState(false);
  const [hostUsername, setHostUsername] = useState("");
  const [joinRequests, setJoinRequests] = useState([]);
  const [isRejected, setIsRejected] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [hostAlerts, setHostAlerts] = useState([]);

  const messagesEndRef = useRef(null);
  const socketUsRef = useRef(null);
  const hasBeenRejectedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    socketUsRef.current = wsConnection();
    const socket = socketUsRef.current;

    socket.on("connect", () => {
      socket.emit("getGroupStatus");
      hasBeenRejectedRef.current = false;
      setIsRejected(false);
    });
    socket.on("group:status", (status) => {
      setGroupExists(status.hasHost);
      setHostUsername(status.hostUsername);
    });
    socket.on("users:update", (usersList) => setUsers(usersList));
    socket.on("typing:update", (typingList) =>
      setTypingUsers(typingList.filter((u) => u !== currentUser)),
    );
    socket.on("join:request", (request) => {
      setJoinRequests((prev) => [
        ...prev,
        {
          id: `request-${request.socketId}`,
          socketId: request.socketId,
          username: request.username,
          timestamp: request.timestamp,
        },
      ]);
    });
    socket.on("request:handled", ({ socketId }) => {
      setJoinRequests((prev) =>
        prev.filter((req) => req.socketId !== socketId),
      );
    });
    socket.on("join:pending", (data) => {
      setIsPending(true);
      setCurrentUser(data.username);
      setJoinError(data.message);
      setIsRejected(false);
    });
    socket.on("join:rejected", (data) => {
      hasBeenRejectedRef.current = true;
      setIsRejected(true);
      setIsPending(false);
      setIsUsernameSet(false);
      setIsJoined(false);
      setJoinError(data.message || "Host rejected your join request");
      setCurrentUser("");
    });
    socket.on("join:alert", (data) => {
      const alertId = Date.now();
      setHostAlerts((prev) => [
        ...prev,
        {
          id: alertId,
          username: data.username,
          message: data.message,
          type: data.type || "info",
        },
      ]);
      setTimeout(
        () => setHostAlerts((prev) => prev.filter((a) => a.id !== alertId)),
        3000,
      );
    });
    socket.on("group:reset", (data) => {
      setJoinError(`Host (${data.hostUsername}) disconnected. Group closed.`);
      setIsJoined(false);
      setIsUsernameSet(false);
      setIsHost(false);
      setIsPending(false);
      setIsRejected(false);
      hasBeenRejectedRef.current = false;
      setUsers([]);
      setMessages([]);
      setGroupExists(false);
      setHostUsername("");
      setJoinRequests([]);
      setShowPasswordField(false);
      setHostAlerts([]);
    });
    return () => {
      if (socketUsRef.current) socketUsRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    const socket = socketUsRef.current;
    if (!socket) return;
    socket.on("join:success", ({ username, isHost, message }) => {
      if (hasBeenRejectedRef.current) return;
      setJoinError("");
      setIsJoined(true);
      setIsPending(false);
      setIsRejected(false);
      hasBeenRejectedRef.current = false;
      setCurrentUser(username);
      setIsHost(isHost);
      setShowPasswordField(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: message,
          username: "System",
          sender: "system",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    });
    socket.on("join:error", (data) => {
      if (data.message === "Host rejected your join request") {
        setIsRejected(true);
        hasBeenRejectedRef.current = true;
      }
      setJoinError(data.message);
      setIsUsernameSet(false);
      setIsPending(false);
      setIsRejected(false);
      setShowPasswordField(false);
    });
    return () => {
      socket.off("join:success");
      socket.off("join:error");
    };
  }, []);

  useEffect(() => {
    const socket = socketUsRef.current;
    socket.on("message:new", (msg) => {
      setMessages((prev) => [
        ...prev,
        { ...msg, sender: msg.sender === socket.id ? "me" : "other" },
      ]);
    });
    return () => socket.off("message:new");
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleUsernameSubmit = (e) => {
    e.preventDefault();
    const user = username.trim();
    if (!user) {
      setJoinError("Username is required");
      return;
    }
    if (user.length < 3) {
      setJoinError("Username must be at least 3 characters");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(user)) {
      setJoinError("Letters and numbers only");
      return;
    }
    setJoinError("");
    setCurrentUser(user);
    setShowPasswordField(true);
    if (!groupExists) setIsUsernameSet(true);
  };

  const handleSendRequest = () => {
    if (!username.trim()) {
      setJoinError("Username is required");
      return;
    }
    setJoinError("");
    setIsUsernameSet(true);
    setCurrentUser(username.trim());
    socketUsRef.current.emit("joinWithPassword", {
      username: username.trim(),
      password: "",
    });
  };

  const handleJoinWithPassword = (e) => {
    e.preventDefault();
    if (isRejected || hasBeenRejectedRef.current) {
      setJoinError("You were rejected. Please refresh to try again.");
      return;
    }
    const user = username.trim();
    const pass = password.trim();
    if (!user || !pass) {
      setJoinError("Username and password required");
      return;
    }
    if (user.length < 3) {
      setJoinError("Username must be at least 3 characters");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(user)) {
      setJoinError("Letters and numbers only");
      return;
    }
    setJoinError("");
    setIsUsernameSet(true);
    setCurrentUser(user);
    setIsRejected(false);
    hasBeenRejectedRef.current = false;
    socketUsRef.current.emit("joinWithPassword", {
      username: user,
      password: pass,
    });
  };

  const handleRequestAction = (socketId, action) => {
    socketUsRef.current.emit("handleJoinRequest", { socketId, action });
    setJoinRequests((prev) => prev.filter((req) => req.socketId !== socketId));
  };
  const handleDismissRequest = (socketId) =>
    setJoinRequests((prev) => prev.filter((req) => req.socketId !== socketId));
  const handleResetForm = () => window.location.reload();
  const handleBackToUsername = () => {
    setShowPasswordField(false);
    setPassword("");
    setJoinError("");
  };

  const typingTimeout = useRef(null);
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!e.target.value.trim()) {
      socketUsRef.current.emit("stopTyping", currentUser);
      return;
    }
    socketUsRef.current.emit("typing", currentUser);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(
      () => socketUsRef.current.emit("stopTyping", currentUser),
      1500,
    );
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socketUsRef.current.emit("sendMessage", {
      id: Date.now(),
      text: newMessage,
      sender: socketUsRef.current.id,
      username: currentUser,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
    setNewMessage("");
  };

  if (!isJoined || isRejected || hasBeenRejectedRef.current) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090d] px-4 py-10">
        <div className="lobby-grid pointer-events-none absolute inset-0" />

        <div className="orb orb-green pointer-events-none absolute" />
        <div className="orb orb-amber pointer-events-none absolute" />

        <div className="lobby-fadein relative z-10 w-full max-w-sm">
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d1520] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.65)]">
            <div className="mb-6 flex justify-center">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${
                  groupExists
                    ? "border-amber-400/25 bg-amber-400/10 text-amber-400 shadow-[0_0_28px_rgba(245,158,11,0.12)]"
                    : "border-emerald-400/25 bg-emerald-400/10 text-emerald-400 icon-glow-green shadow-[0_0_28px_rgba(16,185,129,0.12)]"
                }`}
              >
                {groupExists ? (
                  <Lock className="h-7 w-7" />
                ) : (
                  <Shield className="h-7 w-7" />
                )}
              </div>
            </div>

            <div className="mb-7 text-center">
              <h1 className="font-syne mb-1.5 text-2xl font-extrabold tracking-tight text-white">
                {groupExists ? "Join Room" : "Create Room"}
              </h1>
              <p className="text-sm text-slate-500">
                {groupExists
                  ? `Hosted by ${hostUsername}`
                  : "You'll become the host"}
              </p>
            </div>

            {joinError && (
              <div
                className={`mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed lobby-alert-in ${
                  isPending
                    ? "border-amber-500/20 bg-amber-500/8 text-amber-300"
                    : "border-red-500/20 bg-red-500/8 text-red-300"
                }`}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            {!showPasswordField ? (
              <form onSubmit={handleUsernameSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. Alex42"
                    autoFocus
                    disabled={
                      isPending || isRejected || hasBeenRejectedRef.current
                    }
                    className="w-full rounded-xl border border-white/8 bg-[#111d2b] px-4 py-3 text-sm text-white placeholder-slate-700 outline-none transition-all duration-200 focus:border-emerald-500/35 focus:ring-2 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <p className="text-[11px] text-slate-700">
                    Letters &amp; numbers · min 3 chars
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={
                    !username.trim() ||
                    isPending ||
                    isRejected ||
                    hasBeenRejectedRef.current
                  }
                  className={`cursor-pointer btn-lift flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                    groupExists
                      ? "bg-amber-500 hover:bg-amber-400 shadow-[0_4px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_6px_30px_rgba(245,158,11,0.4)]"
                      : "bg-emerald-500 hover:bg-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.28)] hover:shadow-[0_6px_30px_rgba(16,185,129,0.4)]"
                  }`}
                >
                  Continue <span className="btn-arrow">→</span>
                </button>

                {(isRejected || hasBeenRejectedRef.current) && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full rounded-xl border border-white/[0.07] py-3 text-sm font-medium text-slate-500 transition hover:border-white/12 hover:bg-white/3 hover:text-slate-300"
                  >
                    Refresh &amp; Try Again
                  </button>
                )}
              </form>
            ) : (
              <form onSubmit={handleJoinWithPassword} className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-white/6 bg-[#111d2b] px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 online-pulse" />
                    <span className="text-sm font-medium text-white">
                      {username}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBackToUsername}
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
                  >
                    <ArrowLeft className="h-3 w-3" /> Change
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    {groupExists ? "Password" : "Set Password"}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      groupExists
                        ? "Enter to join directly…"
                        : "Choose a group password"
                    }
                    disabled={
                      isPending || isRejected || hasBeenRejectedRef.current
                    }
                    className="w-full rounded-xl border border-white/8 bg-[#111d2b] px-4 py-3 text-sm text-white placeholder-slate-700 outline-none transition-all duration-200 focus:border-emerald-500/35 focus:ring-2 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <p className="text-[11px] text-slate-700">
                    {groupExists
                      ? "Leave empty to send a join request"
                      : "Members will use this to enter"}
                  </p>
                </div>

                {groupExists && !password.trim() ? (
                  <button
                    type="button"
                    onClick={handleSendRequest}
                    disabled={
                      isPending || isRejected || hasBeenRejectedRef.current
                    }
                    className="btn-lift flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white shadow-[0_4px_20px_rgba(245,158,11,0.28)] transition hover:bg-amber-400 hover:shadow-[0_6px_28px_rgba(245,158,11,0.4)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <UserPlus className="h-4 w-4" /> Send Join Request
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      !username.trim() ||
                      isPending ||
                      isRejected ||
                      hasBeenRejectedRef.current
                    }
                    className={`cursor-pointer btn-lift flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                      groupExists
                        ? "bg-amber-500 hover:bg-amber-400 shadow-[0_4px_20px_rgba(245,158,11,0.28)]"
                        : "bg-emerald-500 hover:bg-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.28)]"
                    }`}
                  >
                    {groupExists ? "Join Room" : "Create Room"}{" "}
                    <span className="btn-arrow">→</span>
                  </button>
                )}

                {(isRejected || hasBeenRejectedRef.current) && (
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full rounded-xl border border-white/[0.07] py-3 text-sm font-medium text-slate-500 transition hover:border-white/12 hover:bg-white/3 hover:text-slate-300"
                  >
                    Refresh &amp; Try Again
                  </button>
                )}
              </form>
            )}

            <p className="mt-6 border-t border-white/5 pt-5 text-center text-[11px] leading-relaxed text-slate-700">
              {isRejected || hasBeenRejectedRef.current
                ? "Your request was declined by the host."
                : groupExists
                  ? "Use a password to enter immediately, or request access."
                  : "As host you approve & manage all join requests."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#07090d]">
      {isHost && hostAlerts.length > 0 && (
        <div className="fixed right-4 top-4 z-50 flex flex-col gap-2 w-72 max-w-[calc(100vw-2rem)]">
          {hostAlerts.map((a) => (
            <div
              key={a.id}
              className="toast-in flex items-start gap-3 rounded-xl border border-sky-500/20 bg-[#0c1e30]/95 px-4 py-3.5 shadow-2xl backdrop-blur-xl"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0text-sky-400" />
              <div>
                <p className="text-xs font-semibold text-sky-300">
                  {a.username} wants to join
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{a.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {isHost && joinRequests.length > 0 && (
        <div className="fixed right-4 top-18 z-50 flex flex-col gap-2.5 w-72 max-w-[calc(100vw-2rem)]">
          {joinRequests.map((req) => (
            <div
              key={req.id}
              className="toast-in rounded-xl border border-amber-500/18 bg-[#130f05]/95 p-4 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Join Request
                  </span>
                </div>
                <button
                  onClick={() => handleDismissRequest(req.socketId)}
                  className="rounded p-0.5 text-slate-600 transition hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="font-syne text-sm font-bold text-white">
                {req.username}
              </p>
              <p className="mb-3.5 mt-0.5 text-xs text-slate-500">
                wants to join the room
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRequestAction(req.socketId, "approve")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                >
                  <Check className="h-3.5 w-3.5" /> Allow
                </button>
                <button
                  onClick={() => handleRequestAction(req.socketId, "reject")}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/8 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/15"
                >
                  <X className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
              <p className="mt-2.5 text-right text-[10px] text-slate-700">
                {new Date(req.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <header className="flex shrink-0items-center justify-between border-b border-white/5 bg-[#0b1219] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0items-center justify-center rounded-xl border ${
              isHost
                ? "border-amber-500/30 bg-amber-500/8 text-amber-400"
                : "border-emerald-500/30 bg-emerald-500/8 text-emerald-400"
            }`}
          >
            {isHost ? (
              <Shield className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
          </div>
          <div>
            <h2 className="font-syne text-sm font-extrabold tracking-tight text-white">
              Group Room
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 online-pulse" />
              <span>{users.length} online</span>
              <span className="text-slate-700">·</span>
              <span className="font-medium text-slate-300">{currentUser}</span>
              {isHost && (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-widest text-amber-400">
                  host
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isHost && joinRequests.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/8 px-2.5 py-1 text-[11px] font-semibold text-amber-400">
              <UserPlus className="h-3 w-3" />
              {joinRequests.length}
            </div>
          )}
          <button className="rounded-lg p-1.5 text-slate-600 transition hover:bg-white/4 hover:text-white">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="shrink-0border-b border-white/4 bg-[#09101a] px-4 py-2.5">
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0text-[10px] font-semibold uppercase tracking-widest text-slate-700">
            Online
          </span>
          <span className="shrink-0text-slate-800">·</span>
          <div className="flex items-center gap-1.5">
            {users.map((user, i) => (
              <div
                key={i}
                className={`flex shrink-0items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  user === currentUser
                    ? isHost
                      ? "border-amber-500/20 bg-amber-500/8 text-amber-300"
                      : "border-emerald-500/20 bg-emerald-500/8 text-emerald-300"
                    : "border-white/5 bg-white/2 text-slate-500"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0rounded-full ${
                    user === currentUser
                      ? isHost
                        ? "bg-amber-400 online-pulse"
                        : "bg-emerald-400 online-pulse"
                      : "bg-slate-600"
                  }`}
                />
                {user}
                {user === currentUser && (
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-60">
                    {isHost ? "host" : "you"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {typingUsers.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="typing-dots flex items-center gap-0.5">
              <span />
              <span />
              <span />
            </div>
            <span className="text-[11px] italic text-slate-600">
              {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"}{" "}
              typing…
            </span>
          </div>
        )}
      </div>

      <div className="chat-bg flex-1 overflow-y-auto px-3 py-5 sm:px-5">
        <div className="flex flex-col gap-1.5">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`msg-in flex ${msg.sender === "me" ? "justify-end" : msg.sender === "system" ? "justify-center" : "justify-start"}`}
            >
              {msg.sender === "system" ? (
                <div className="flex items-center gap-2 rounded-full border border-sky-500/15 bg-sky-500/6 px-4 py-1.5 text-[11px] text-sky-400/70">
                  <span className="h-1 w-1 rounded-full bg-sky-500" />
                  {msg.text}
                </div>
              ) : (
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 sm:max-w-sm lg:max-w-md ${
                    msg.sender === "me"
                      ? "rounded-br-sm border border-emerald-900/35 bg-[#0b2d1d]"
                      : "rounded-bl-sm border border-white/5 bg-[#101b28]"
                  }`}
                >
                  {msg.sender !== "me" && (
                    <span className="mb-1 block text-[11px] font-semibold text-emerald-400/90">
                      {msg.username}
                    </span>
                  )}
                  <p className="text-sm leading-relaxed text-slate-200">
                    {msg.text}
                  </p>
                  <div className="mt-1.5 flex items-center justify-end gap-1">
                    <span className="text-[10px] text-slate-700">
                      {msg.time}
                    </span>
                    {msg.sender === "me" &&
                      (msg.read ? (
                        <CheckCheck className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Check className="h-3 w-3 text-slate-700" />
                      ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0border-t border-white/5 bg-[#0b1219] px-3 py-3 sm:px-4">
        <form
          onSubmit={handleSendMessage}
          className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#0f1d2b] px-3 py-1.5 transition-all duration-200 focus-within:border-emerald-500/30 focus-within:shadow-[0_0_0_3px_rgba(16,185,129,0.06)]"
        >
          <button
            type="button"
            className="shrink-0p-1.5 text-slate-700 transition hover:text-slate-400"
          >
            <Smile className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={newMessage}
            onChange={handleTyping}
            placeholder="Write a message…"
            className="flex-1 min-w-0 bg-transparent py-2 text-sm text-slate-100 placeholder-slate-700 outline-none"
          />
          {newMessage.trim() ? (
            <button
              type="submit"
              className="flex h-9 w-9 shrink-0items-center justify-center rounded-xl bg-emerald-500 text-white shadow-[0_3px_16px_rgba(16,185,129,0.38)] transition-all duration-150 hover:bg-emerald-400 hover:shadow-[0_5px_22px_rgba(16,185,129,0.5)] active:scale-90"
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/3 text-slate-600 transition hover:bg-white/6 hover:text-slate-400"
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default App;
