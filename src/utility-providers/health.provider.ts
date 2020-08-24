import { ProviderBase } from '../provider-base';
import os from 'os';
import { AfterStartInit, Init } from '../decorators';

export class HealthProvider extends ProviderBase {
  private cpuUsage: number;
  private freeMemory: number;
  private totalMemory: number;

  @Init
  async init() {
    this.startGathering();
  }

  @AfterStartInit
  afterInit() {
    this.netjam.getRedisClient().useMetricMiddleware(() => {
      return {
        CPU: `${this.cpuUsage}%`,
        RAM: `${this.freeMemory}/${this.totalMemory}`,
      };
    });
  }

  private startGathering() {
    setInterval(() => {
      this.freeMemory = os.freemem();
      this.totalMemory = os.totalmem();
      this.cpuUsage = 0;
    }, 5000);
  }
}
