/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await */
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { AuditLoggerService } from '../../../core/audit/audit-logger.service';
import { getDatabase } from '../../../infrastructure/database';
import { ObjectStorageService } from '../../../infrastructure/object-storage/object-storage.service';
import { UomRepository } from '../../master-data/uom/uom.repository';
import type {
	CreateProductDto,
	ListProductsQueryDto,
	UpdateProductDto,
} from './product.dto';
import { ProductRepository } from './product.repository';

@Injectable()
export class ProductService {
	private readonly logger = new Logger(ProductService.name);

	constructor(
		private readonly productRepo: ProductRepository,
		private readonly uomRepo: UomRepository,
		private readonly auditLoggerService: AuditLoggerService,
		private readonly objectStorageService: ObjectStorageService,
	) {}

	async create(
		dto: CreateProductDto,
		actorId: string,
		workspaceId: string,
		ipAddress: string,
	) {
		const uom = await this.uomRepo.findById(dto.uomId);
		if (!uom || !uom.isActive) {
			throw new BadRequestException('Unit of measure not found or is inactive');
		}

		const existingSku = await this.productRepo.findBySku(dto.sku);
		if (existingSku) {
			throw new ConflictException(
				'A product with the same SKU already exists in this workspace',
			);
		}

		const result = await getDatabase().transaction(async (tx) => {
			const product = await this.productRepo.create(
				{
					workspaceId,
					supplierCategoryId: dto.supplierCategoryId,
					uomId: dto.uomId,
					sku: dto.sku,
					name: dto.name,
					description: dto.description ?? null,
					unitPrice: dto.unitPrice,
					minOrderQty: dto.minOrderQty ?? 1,
					status: 'draft',
					imageUrls: dto.imageUrls ?? null,
					attributes: dto.attributes ?? null,
					createdBy: actorId,
				},
				tx,
			);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId,
				action: 'PRODUCT_CREATE',
				resourceType: 'product',
				resourceId: product.id,
				changes: {
					sku: dto.sku,
					name: dto.name,
					unitPrice: dto.unitPrice,
				},
				ipAddress,
				status: 'success',
			});

			return product;
		});

		this.logger.log(`Product created: ${result.name} (${result.id})`);
		return this.withSignedUrls(result);
	}

	async findAll(query: ListProductsQueryDto) {
		const result = await this.productRepo.findAll({
			keyword: query.keyword,
			categoryId: query.categoryId,
			status: query.status,
			minPrice: query.minPrice,
			maxPrice: query.maxPrice,
			sortBy: query.sortBy,
			order: query.order,
			limit: query.limit,
			offset: query.offset,
		});

		const items = await Promise.all(
			result.items.map((item: any) => this.withSignedUrls(item)),
		);

		return { ...result, items };
	}

	async findById(id: string) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}
		return this.withSignedUrls(product);
	}

	async checkSkuAvailability(sku: string) {
		const existing = await this.productRepo.findBySku(sku);
		return { available: !existing };
	}

	async getPriceHistory(id: string) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}
		return this.productRepo.getPriceHistory(id);
	}

	async update(
		id: string,
		dto: UpdateProductDto,
		actorId: string,
		workspaceId: string,
		ipAddress: string,
	) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}

		const oldValues = {
			name: product.name,
			description: product.description,
			unitPrice: product.unitPrice,
			minOrderQty: product.minOrderQty,
			imageUrls: product.imageUrls,
			attributes: product.attributes,
		};

		const priceChanged =
			dto.unitPrice !== undefined && dto.unitPrice !== product.unitPrice;

		const updated = await getDatabase().transaction(async (tx) => {
			if (priceChanged) {
				await this.productRepo.insertPriceHistory(
					{
						productId: id,
						unitPrice: product.unitPrice,
						changedBy: actorId,
					},
					tx,
				);
			}

			const result = await this.productRepo.update(
				id,
				{
					...(dto.name !== undefined && { name: dto.name }),
					...(dto.description !== undefined && {
						description: dto.description,
					}),
					...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
					...(dto.minOrderQty !== undefined && {
						minOrderQty: dto.minOrderQty,
					}),
					...(dto.imageUrls !== undefined && { imageUrls: dto.imageUrls }),
					...(dto.attributes !== undefined && {
						attributes: dto.attributes,
					}),
				},
				tx,
			);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId,
				action: 'PRODUCT_UPDATE',
				resourceType: 'product',
				resourceId: id,
				changes: { old: oldValues, new: dto },
				ipAddress,
				status: 'success',
			});

			return result;
		});

		this.logger.log(`Product updated: ${updated.name} (${id})`);
		return this.withSignedUrls(updated);
	}

	async publish(
		id: string,
		actorId: string,
		workspaceId: string,
		ipAddress: string,
	) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}

		if (product.status !== 'draft' && product.status !== 'inactive') {
			throw new BadRequestException(
				'Only draft or inactive products can be published',
			);
		}

		const updated = await getDatabase().transaction(async (tx) => {
			const result = await this.productRepo.update(
				id,
				{ status: 'active' },
				tx,
			);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId,
				action: 'PRODUCT_PUBLISH',
				resourceType: 'product',
				resourceId: id,
				changes: {
					old: { status: product.status },
					new: { status: 'active' },
				},
				ipAddress,
				status: 'success',
			});

			return result;
		});

		this.logger.log(`Product published: ${updated.name} (${id})`);
		return this.withSignedUrls(updated);
	}

	async unpublish(
		id: string,
		actorId: string,
		workspaceId: string,
		ipAddress: string,
	) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}

		if (product.status !== 'active') {
			throw new BadRequestException('Only active products can be unpublished');
		}

		const openRfqCount = await this.productRepo.countByRfqPendingResponse(id);

		const updated = await getDatabase().transaction(async (tx) => {
			const result = await this.productRepo.update(
				id,
				{ status: 'inactive' },
				tx,
			);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId,
				action: 'PRODUCT_UNPUBLISH',
				resourceType: 'product',
				resourceId: id,
				changes: {
					old: { status: 'active' },
					new: { status: 'inactive' },
				},
				ipAddress,
				status: 'success',
			});

			return result;
		});

		this.logger.log(`Product unpublished: ${updated.name} (${id})`);

		const response: any = { data: await this.withSignedUrls(updated) };
		if (openRfqCount > 0) {
			response.warning = 'This product is referenced in one or more open RFQs.';
		}
		return response;
	}

	async deleteProduct(
		id: string,
		actorId: string,
		workspaceId: string,
		ipAddress: string,
	) {
		const product = await this.productRepo.findById(id);
		if (!product) {
			throw new NotFoundException('Product not found');
		}

		if (product.status !== 'draft') {
			throw new ConflictException(
				'Only draft products can be deleted. Use unpublish for active products.',
			);
		}

		await getDatabase().transaction(async (tx) => {
			await this.productRepo.delete(id, tx);

			await this.auditLoggerService.logInTx(tx as any, {
				actorId,
				workspaceId,
				action: 'PRODUCT_DELETE',
				resourceType: 'product',
				resourceId: id,
				changes: { sku: product.sku, name: product.name },
				ipAddress,
				status: 'success',
			});
		});

		this.logger.log(`Product deleted: ${product.name} (${id})`);
		return { deleted: true };
	}

	private async withSignedUrls(product: any): Promise<any> {
		if (
			!product?.imageUrls ||
			!Array.isArray(product.imageUrls) ||
			product.imageUrls.length === 0
		) {
			return product;
		}

		if (!this.objectStorageService.isReady()) {
			return product;
		}

		try {
			const signedUrls = await Promise.all(
				product.imageUrls.map((key: string) => this.generateSignedUrl(key)),
			);
			return { ...product, imageUrls: signedUrls };
		} catch {
			return product;
		}
	}

	private async generateSignedUrl(objectKey: string): Promise<string> {
		if (objectKey.startsWith('http://') || objectKey.startsWith('https://')) {
			return objectKey;
		}
		return objectKey;
	}
}
