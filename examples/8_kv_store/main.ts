import { Builtin, KVStore } from "floww";

export const builtin = new Builtin();
export const kv = new KVStore("default");

// Type definitions for our data
type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type SessionData = {
  userId: string;
  loginTime: string;
  ipAddress: string;
};

// Example: User Management with KV Store
builtin.triggers.onWebhook<{ action: string; userId?: string; name?: string; email?: string }>({
  handler: async (ctx, event) => {
    const { action, userId, name, email } = event.body;

    try {
      switch (action) {
        case "create-user": {
          if (!userId || !name || !email) {
            console.log("❌ Missing required fields: userId, name, email");
            return;
          }

          const user: User = {
            id: userId,
            name,
            email,
            createdAt: new Date().toISOString(),
          };

          // Store user in KV
          await kv.set<User>("users", userId, user);
          console.log(`✅ User created: ${name} (${userId})`);
          const userTable = kv.getTable<User>("users")
          await userTable.set(userId, user)
          break;
        }

        case "get-user": {
          if (!userId) {
            console.log("❌ Missing userId");
            return;
          }

          // Retrieve user from KV
          const user = await kv.get<User>("users", userId);
          console.log(`👤 User found:`, user);
          break;
        }

        case "update-user": {
          if (!userId) {
            console.log("❌ Missing userId");
            return;
          }

          // Get existing user
          const existingUser = await kv.get<User>("users", userId);

          // Update fields
          const updatedUser: User = {
            ...existingUser,
            name: name || existingUser.name,
            email: email || existingUser.email,
          };

          // Save updated user
          await kv.set<User>("users", userId, updatedUser);
          console.log(`✅ User updated: ${userId}`);
          break;
        }

        case "delete-user": {
          if (!userId) {
            console.log("❌ Missing userId");
            return;
          }

          await kv.delete("users", userId);
          console.log(`✅ User deleted: ${userId}`);
          break;
        }

        case "list-users": {
          // List all users
          const users = await kv.listItems<User>("users");
          console.log(`📋 Found ${users.length} user(s):`);
          users.forEach(item => {
            console.log(`  - ${item.value.name} (${item.key})`);
          });
          break;
        }

        case "list-tables": {
          // List all tables
          const tables = await kv.listTables();
          console.log(`📊 KV Store Tables:`, tables);
          break;
        }

        default:
          console.log(`❓ Unknown action: ${action}`);
          console.log(`Available actions: create-user, get-user, update-user, delete-user, list-users, list-tables`);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Error: ${error.message}`);
      } else {
        console.error(`❌ Unknown error:`, error);
      }
    }
  },
  path: "/users",
});

// Example: Session Management
builtin.triggers.onWebhook<{ sessionId?: string; userId?: string; ipAddress?: string }>({
  handler: async (ctx, event) => {
    const { sessionId, userId, ipAddress } = event.body;

    try {
      if (!sessionId || !userId || !ipAddress) {
        console.log("❌ Missing required fields: sessionId, userId, ipAddress");
        return;
      }

      // Create session
      const session: SessionData = {
        userId,
        loginTime: new Date().toISOString(),
        ipAddress,
      };

      await kv.set<SessionData>("sessions", sessionId, session);
      console.log(`🔐 Session created: ${sessionId} for user ${userId}`);

      // List all active sessions
      const sessions = await kv.listItems<SessionData>("sessions");
      console.log(`📊 Active sessions: ${sessions.length}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  },
  path: "/sessions/create",
});

// Example: Simple Counter (demonstrating get/set pattern)
builtin.triggers.onWebhook<{ increment?: number }>({
  handler: async (ctx, event) => {
    try {
      let currentCount = 0;

      // Try to get existing count
      try {
        currentCount = await kv.get<number>("counters", "page-views");
      } catch (error) {
        console.log(error)
        // Key doesn't exist yet, start at 0
        console.log("Initializing counter...");
      }

      // Increment
      const increment = event.body.increment || 1;
      const newCount = currentCount + increment;

      // Save new count
      await kv.set<number>("counters", "page-views", newCount);

      console.log(`📈 Page views: ${currentCount} → ${newCount} (+${increment})`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  },
  path: "/counter",
});

// Example: Cache Pattern (with expiration logic)
builtin.triggers.onWebhook<{ key?: string; invalidate?: boolean }>({
  handler: async (ctx, event) => {
    const { key, invalidate } = event.body;

    try {
      if (!key) {
        console.log("❌ Missing cache key");
        return;
      }

      if (invalidate) {
        // Clear cache
        await kv.delete("cache", key);
        console.log(`🗑️  Cache invalidated: ${key}`);
        return;
      }

      // Try to get from cache
      try {
        const cached = await kv.get<{ data: any; cachedAt: string }>("cache", key);
        const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        if (cacheAge < maxAge) {
          console.log(`💾 Cache hit: ${key} (age: ${Math.round(cacheAge / 1000)}s)`);
          console.log(`Data:`, cached.data);
          return;
        } else {
          console.log(`⏰ Cache expired: ${key}`);
        }
      } catch (error) {
        console.log(`❌ Cache miss: ${key}`);
      }

      // Simulate fetching fresh data
      const freshData = {
        value: Math.random(),
        fetchedAt: new Date().toISOString(),
      };

      // Store in cache
      await kv.set("cache", key, {
        data: freshData,
        cachedAt: new Date().toISOString(),
      });

      console.log(`✅ Cache updated: ${key}`);
      console.log(`Data:`, freshData);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  },
  path: "/cache",
});
