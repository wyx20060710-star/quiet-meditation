import { AppController } from './controller';
import { IndexedDbRepository } from '../infrastructure/database';
import { MemoryRepository } from '../infrastructure/memory-repository';
import { BrowserChannel, NoopChannel } from '../infrastructure/channel';
import { ForestAmbientSound, GentleChime } from '../infrastructure/sound';

export async function bootstrap(): Promise<AppController> {
  try {
    const repository = await IndexedDbRepository.open();
    const controller = new AppController(repository, undefined, true, new GentleChime(), new BrowserChannel(), undefined, new ForestAmbientSound());
    await controller.initialize();
    return controller;
  } catch {
    const controller = new AppController(new MemoryRepository(), undefined, false, new GentleChime(), new NoopChannel(), undefined, new ForestAmbientSound());
    await controller.initialize();
    return controller;
  }
}
