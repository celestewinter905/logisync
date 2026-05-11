/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import {
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { AuditLoggerService } from '../../../core/audit/audit-logger.service';
import { getDatabase } from '../../../infrastructure/database';
import { MessageQueueService } from '../../../infrastructure/message-queue/message-queue.service';
import type { CreateUomDto, UpdateUomDto } from './uom.dto';
import { UomRepository } from './uom.repository';

const CACHE_INVALIDATION_QUEUE = 'master-data:units-of-measure';

@Injectable()
export class UomService {
	private readonly logger = new Logger(UomService.name);

	constructor(
		private readonly uomRepo: UomRepository,
		private readonly auditLoggerService: AuditLoggerService,
		private readonly messageQueueService: MessageQueueService,
	) {}

	async create(dto: CreateUomDto, actorId: string, ipAddress: string) {
		const existing = await this.uomRepo.findByNameOrCode(dto.name, dto.code);
		if (existing) {
			throw new ConflictException(
				'A unit of measure with the same name or code already exists',
			);
		}

		const result = await getDatabase().transaction(async (tx) => {
			const uom = await this.uomRepo.create(
				{
					name: dto.name,
					code: dto.code,
					createdBy: actorId,
				},
				tx,
			);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId: 'platform',
				action: 'UOM_CREATE',
				resourceType: 'unit_of_measure',
				resourceId: uom.id,
				changes: { name: dto.name, code: dto.code },
				ipAddress,
				status: 'success',
			});

			return uom;
		});

		await this.invalidateCache();
		this.logger.log(`Unit of measure created: ${result.name} (${result.id})`);
		return result;
	}

	async findAll() {
		return this.uomRepo.findAll();
	}

	async findAllActive() {
		return this.uomRepo.findAllActive();
	}

	async findById(id: string) {
		const uom = await this.uomRepo.findById(id);
		if (!uom) {
			throw new NotFoundException('Unit of measure not found');
		}
		return uom;
	}

	async update(
		id: string,
		dto: UpdateUomDto,
		actorId: string,
		ipAddress: string,
	) {
		const uom = await this.findById(id);

		if (dto.name || dto.code) {
			const existing = await this.uomRepo.findByNameOrCode(
				dto.name ?? uom.name,
				dto.code ?? uom.code,
				id,
			);
			if (existing) {
				throw new ConflictException(
					'A unit of measure with the same name or code already exists',
				);
			}
		}

		const oldValues = { name: uom.name, code: uom.code };

		const updated = await this.uomRepo.update(id, {
			...(dto.name !== undefined && { name: dto.name }),
			...(dto.code !== undefined && { code: dto.code }),
		});

		await this.auditLoggerService.log({
			actorId,
			workspaceId: 'platform',
			action: 'UOM_UPDATE',
			resourceType: 'unit_of_measure',
			resourceId: id,
			changes: { old: oldValues, new: dto },
			ipAddress,
			status: 'success',
		});

		await this.invalidateCache();
		this.logger.log(`Unit of measure updated: ${updated.name} (${id})`);
		return updated;
	}

	async disable(id: string, actorId: string, ipAddress: string) {
		await this.findById(id);

		const updated = await this.uomRepo.disable(id);

		await this.auditLoggerService.log({
			actorId,
			workspaceId: 'platform',
			action: 'UOM_DISABLE',
			resourceType: 'unit_of_measure',
			resourceId: id,
			changes: { isActive: false, disabledAt: updated.disabledAt },
			ipAddress,
			status: 'success',
		});

		await this.invalidateCache();
		this.logger.log(`Unit of measure disabled: ${updated.name} (${id})`);
		return updated;
	}

	async enable(id: string, actorId: string, ipAddress: string) {
		await this.findById(id);

		const updated = await this.uomRepo.enable(id);

		await this.auditLoggerService.log({
			actorId,
			workspaceId: 'platform',
			action: 'UOM_ENABLE',
			resourceType: 'unit_of_measure',
			resourceId: id,
			changes: { isActive: true, disabledAt: null },
			ipAddress,
			status: 'success',
		});

		await this.invalidateCache();
		this.logger.log(`Unit of measure re-enabled: ${updated.name} (${id})`);
		return updated;
	}

	private async invalidateCache(): Promise<void> {
		try {
			if (this.messageQueueService.isReady()) {
				await this.messageQueueService.publishMessage(
					CACHE_INVALIDATION_QUEUE,
					{
						event: 'cache_invalidate',
						key: CACHE_INVALIDATION_QUEUE,
						timestamp: new Date().toISOString(),
					},
				);
			}
		} catch (error) {
			this.logger.warn(
				'Failed to publish cache invalidation event',
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}
