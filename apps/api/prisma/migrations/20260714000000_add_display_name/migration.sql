-- Player's chosen in-game display name (nullable; falls back to firstName).
ALTER TABLE "User" ADD COLUMN "displayName" TEXT;
