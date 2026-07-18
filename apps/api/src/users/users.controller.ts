import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import type { UserProfile } from './user.mapper';
import type { FriendSummary } from './user.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

/** Endpoints for the authenticated user's own account. */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The current user's profile. */
  @Get('me')
  getMe(@CurrentUser() user: AuthUser): Promise<UserProfile> {
    return this.users.getProfile(user.id);
  }

  /** The current user's friends with head-to-head records. */
  @Get('me/friends')
  getFriends(@CurrentUser() user: AuthUser): Promise<FriendSummary[]> {
    return this.users.getFriends(user.id);
  }

  /** Update the current user's chosen display name. */
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserProfile> {
    return this.users.updateDisplayName(user.id, dto.displayName.trim());
  }
}
