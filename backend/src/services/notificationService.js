import Notification from "../models/Notification.js";
import { createDatabaseUnavailableError, isDBConnected, isDemoMode } from "../config/db.js";

const fallbackNotifications = [];

/**
 * Creates an in-app notification for a target user.
 */
export async function createNotification(userId, title, message, type = "system", metadata = {}) {
  if (!userId) return null;

  if (isDBConnected()) {
    try {
      return await Notification.create({
        userId,
        title,
        message,
        type,
        metadata
      });
    } catch (err) {
      if (!isDemoMode()) {
        const error = new Error("Notification could not be persisted.");
        error.statusCode = isDBConnected() ? 500 : 503;
        error.code = error.statusCode === 503 ? "DatabaseUnavailable" : "NotificationPersistenceError";
        throw error;
      }
      console.warn("Failed to create DB notification:", err.message);
    }
  }

  if (!isDemoMode()) throw createDatabaseUnavailableError();

  const newNotif = {
    _id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    userId: userId.toString(),
    title,
    message,
    type,
    read: false,
    metadata,
    createdAt: new Date().toISOString()
  };
  fallbackNotifications.unshift(newNotif);
  return newNotif;
}

/**
 * Retrieves in-app notifications for a user.
 */
export async function getUserNotifications(userId) {
  if (!userId) return [];

  if (isDBConnected()) {
    return await Notification.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  if (!isDemoMode()) throw createDatabaseUnavailableError();

  return fallbackNotifications.filter(n => n.userId === userId.toString());
}

/**
 * Marks notifications as read.
 */
export async function markNotificationsAsRead(userId, notificationIds = []) {
  if (!userId) return false;

  if (isDBConnected()) {
    if (notificationIds.length === 0) {
      await Notification.updateMany({ userId }, { read: true });
    } else {
      await Notification.updateMany({ userId, _id: { $in: notificationIds } }, { read: true });
    }
    return true;
  }

  if (!isDemoMode()) throw createDatabaseUnavailableError();

  fallbackNotifications.forEach(n => {
    if (n.userId === userId.toString()) {
      if (notificationIds.length === 0 || notificationIds.includes(n._id)) {
        n.read = true;
      }
    }
  });
  return true;
}
