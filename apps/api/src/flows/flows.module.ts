import { Module } from '@nestjs/common';
import { FlowsService } from './application/flows.service.js';
import { FLOW_REPOSITORY } from './domain/flow.repository.js';
import { FlowCatalogController, FlowsController } from './http/flows.controller.js';
import { InMemoryFlowRepository } from './infrastructure/in-memory-flow.repository.js';

@Module({
  controllers: [FlowCatalogController, FlowsController],
  exports: [FlowsService],
  providers: [FlowsService, { provide: FLOW_REPOSITORY, useClass: InMemoryFlowRepository }],
})
export class FlowsModule {}
