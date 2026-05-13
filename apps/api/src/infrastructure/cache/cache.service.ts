import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

// Generic Redis cache used by business modules for ephemeral state
// (search filters, reputation scores, etc.). Always degrades gracefully when
// Redis is unavailable so the API never hard-fails on cache outages.
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(CacheService.name);
	private readonly redisUrl: string;
	private redisClient!: RedisClientType;
	private isConnected = false;

	constructor(private readonly configService: ConfigService) {
		this.redisUrl = this.configService.get<string>(
			'REDIS_URL',
			'redis://localhost:6379',
		);
	}

	async onModuleInit() {
		try {
			this.redisClient = createClient({
				url: this.redisUrl,
				socket: {
					connectTimeout: 2000,
					reconnectStrategy: (retries) => Math.min(retries * 50, 5000),
				},
			});

			this.redisClient.on('error', (error: Error) => {
				this.logger.error('Redis error', error.stack);
				this.isConnected = false;
			});

			this.redisClient.on('ready', () => {
				this.isConnected = true;
			});

			await this.redisClient.connect();
			this.isConnected = true;
			this.logger.log('Cache (Redis) connected.');
		} catch (error) {
			this.isConnected = false;
			this.logger.warn(
				'Cache (Redis) unavailable at startup - degraded mode.',
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async onModuleDestroy() {
		if (!this.redisClient?.isOpen) {
			return;
		}
		try {
			await this.redisClient.quit();
		} catch (error) {
			this.logger.warn(
				'Cache (Redis) shutdown error',
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	isReady(): boolean {
		return this.isConnected && this.redisClient?.isOpen === true;
	}

	async get(key: string): Promise<string | null> {
		if (!this.isReady()) return null;
		try {
			return await this.redisClient.get(key);
		} catch (error) {
			this.logger.warn(
				`cache.get(${key}) failed`,
				error instanceof Error ? error.message : String(error),
			);
			return null;
		}
	}

	async getJson<T>(key: string): Promise<T | null> {
		const raw = await this.get(key);
		if (!raw) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}

	async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
		if (!this.isReady()) return;
		try {
			await this.redisClient.setEx(key, ttlSeconds, value);
		} catch (error) {
			this.logger.warn(
				`cache.setEx(${key}) failed`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	async setJsonEx<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
		await this.setEx(key, JSON.stringify(value), ttlSeconds);
	}

	async del(key: string): Promise<void> {
		if (!this.isReady()) return;
		try {
			await this.redisClient.del(key);
		} catch (error) {
			this.logger.warn(
				`cache.del(${key}) failed`,
				error instanceof Error ? error.message : String(error),
			);
		}
	}
}
