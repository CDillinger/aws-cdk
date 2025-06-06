import { ScheduleTargetBase, ScheduleTargetBaseProps } from './target';
import * as events from '../../aws-events';
import { IRole } from '../../aws-iam';
import { IScheduleTarget, ISchedule, ScheduleTargetInput, ScheduleTargetConfig } from '../../aws-scheduler';
import { UnscopedValidationError } from '../../core';

/**
 * An entry to be sent to EventBridge
 *
 * @see https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsRequestEntry.html
 */
export interface EventBridgePutEventsEntry {
  /**
   * The event body
   *
   * Can either be provided as an object or as a JSON-serialized string
   * @example
   *
   * ScheduleTargetInput.fromText('{"instance-id": "i-1234567890abcdef0", "state": "terminated"}');
   * ScheduleTargetInput.fromObject({ Message: 'Hello from a friendly event :)' });
   */
  readonly detail: ScheduleTargetInput;

  /**
   * Used along with the source field to help identify the fields and values expected in the detail field
   *
   * For example, events by CloudTrail have detail type "AWS API Call via CloudTrail"
   * @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-events.html
   */
  readonly detailType: string;

  /**
   * The event bus the entry will be sent to.
   *
   */
  readonly eventBus: events.IEventBus;

  /**
   * The service or application that caused this event to be generated
   *
   * Example value: `com.example.service`
   *
   * @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-events.html
   */
  readonly source: string;
}

/**
 * Send an event to an AWS EventBridge by AWS EventBridge Scheduler.
 */
export class EventBridgePutEvents extends ScheduleTargetBase implements IScheduleTarget {
  constructor(
    private readonly entry: EventBridgePutEventsEntry,
    private readonly props: ScheduleTargetBaseProps = {},
  ) {
    super(props, entry.eventBus.eventBusArn);
    if (this.props.input) {
      throw new UnscopedValidationError('ScheduleTargetBaseProps.input is not supported for EventBridgePutEvents. Please use entry.detail instead.');
    }
  }

  protected addTargetActionToRole(role: IRole): void {
    const eventBus = this.entry.eventBus;

    eventBus.grantPutEventsTo(role);
  }

  protected bindBaseTargetConfig(_schedule: ISchedule): ScheduleTargetConfig {
    return {
      ...super.bindBaseTargetConfig(_schedule),
      input: this.entry.detail,
      eventBridgeParameters: {
        detailType: this.entry.detailType,
        source: this.entry.source,
      },
    };
  }
}
