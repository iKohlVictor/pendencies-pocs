import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseFilters } from '@nestjs/common';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { UsersService } from '../application/users.service.js';

@Controller('profiles')
@UseFilters(DomainErrorFilter)
export class ProfilesController {
  constructor(private readonly service: UsersService) {}

  @Post()
  create(@Body() body: { name?: string; roles?: unknown } = {}) {
    return this.service.createProfile(body.name, body.roles);
  }

  @Get()
  list() {
    return this.service.listProfiles();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getProfile(id);
  }
}

@Controller('users')
@UseFilters(DomainErrorFilter)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Post()
  create(@Body() body: { name?: string; profileId?: string } = {}) {
    return this.service.createUser(body.name, body.profileId);
  }

  /** Filter with ?profileId=PRF-1. */
  @Get()
  list(@Query('profileId') profileId?: string) {
    return this.service.listUsers(profileId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getUser(id);
  }

  /** Moves the user to another profile; their roles change with it. */
  @Put(':id/profile')
  @HttpCode(200)
  assignProfile(@Param('id') id: string, @Body() body: { profileId?: string } = {}) {
    return this.service.assignProfile(id, body.profileId);
  }
}
