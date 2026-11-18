import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, UseFilters } from '@nestjs/common';
import type { Actor } from 'machine-flow';
import { CurrentActor } from '../../shared/http/current-actor.decorator.js';
import { DomainErrorFilter } from '../../shared/http/domain-error.filter.js';
import { FlowsService } from '../application/flows.service.js';
import type { FlowDefinition } from '../domain/flow-definition.js';

@Controller('flow-catalog')
export class FlowCatalogController {
  constructor(private readonly service: FlowsService) {}

  /** The blocks the builder can use: actions, guards, roles, effects. */
  @Get()
  get() {
    return this.service.catalog();
  }
}

@Controller('flows')
@UseFilters(DomainErrorFilter)
export class FlowsController {
  constructor(private readonly service: FlowsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@CurrentActor() _actor: Actor, @Body() body: { id?: string; name?: string; definition?: FlowDefinition } = {}) {
    return this.service.create(body.id, body.name, body.definition);
  }

  /** Validates a definition without saving it. */
  @Post('validate')
  @HttpCode(200)
  validate(@Body() body: { definition: FlowDefinition }) {
    return this.service.validate(body?.definition);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id/draft')
  saveDraft(
    @Param('id') id: string,
    @CurrentActor() _actor: Actor,
    @Body() body: { definition: FlowDefinition; name?: string },
  ) {
    return this.service.saveDraft(id, body?.definition, body?.name);
  }

  @Delete(':id/draft')
  discardDraft(@Param('id') id: string, @CurrentActor() _actor: Actor) {
    return this.service.discardDraft(id);
  }

  /** Freezes the draft as the next version. New pendencies may start using it right away. */
  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string, @CurrentActor() actor: Actor) {
    return this.service.publish(id, actor);
  }

  @Get(':id/versions/:version')
  version(@Param('id') id: string, @Param('version', ParseIntPipe) version: number) {
    return this.service.version(id, version);
  }
}
