/** Public user profile returned by the API. */
export interface UserProfile {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  displayName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  role: string;
  isTelegramPremium: boolean;
  elo: number;
  stats: { gamesPlayed: number; wins: number; losses: number };
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface AuthResult {
  user: UserProfile;
  tokens: AuthTokens;
}
