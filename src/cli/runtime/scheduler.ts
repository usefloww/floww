import cron from 'node-cron';
import { CronTrigger, CronEvent } from '../../common';

export class CronScheduler {
  private tasks: cron.ScheduledTask[] = [];

  register(trigger: CronTrigger) {
    try {
      const task = cron.schedule(trigger.expression, async () => {
        const event: CronEvent = {
          scheduledTime: new Date(),
          actualTime: new Date(),
        };

        try {
          await trigger.handler({}, event);
        } catch (error) {
          console.error(`Cron handler error for "${trigger.expression}":`, error);
        }
      });

      this.tasks.push(task);
      task.start();
    } catch (error) {
      console.error(`Failed to schedule cron "${trigger.expression}":`, error);
      throw error;
    }
  }

  stopAll() {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
  }
}
