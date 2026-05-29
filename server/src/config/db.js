/**
 * db.js
 * ------
 * Establishes and maintains a Mongoose connection to MongoDB.
 * Exports a `connectDB()` function called once at server startup.
 */

import mongoose from "mongoose";

let isConnected = false;

/**
 * Connect to MongoDB using the MONGO_URI environment variable.
 * Safe to call multiple times — returns early if already connected.
 */
export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables.");
  }

  try {
    const conn = await mongoose.connect(uri);

    isConnected = true;
    console.log(`[MongoDB] Connected: ${conn.connection.host}`);

    // Handle connection events after initial connect
    mongoose.connection.on("error", (err) => {
      console.error("[MongoDB] Connection error:", err);
      isConnected = false;
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[MongoDB] Disconnected. Reconnecting…");
      isConnected = false;
    });

    mongoose.connection.on("reconnected", () => {
      console.log("[MongoDB] Reconnected.");
      isConnected = true;
    });
  } catch (err) {
    console.error("[MongoDB] Initial connection failed:", err.message);
    console.log(uri)
    process.exit(1);
  }
}

export default connectDB;
