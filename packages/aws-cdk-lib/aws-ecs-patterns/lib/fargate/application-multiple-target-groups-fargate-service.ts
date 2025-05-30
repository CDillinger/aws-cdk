import { Construct } from 'constructs';
import { FargateService, FargateTaskDefinition } from '../../../aws-ecs';
import { ApplicationTargetGroup } from '../../../aws-elasticloadbalancingv2';
import { FeatureFlags, ValidationError } from '../../../core';
import { propertyInjectable } from '../../../core/lib/prop-injectable';
import * as cxapi from '../../../cx-api';
import {
  ApplicationMultipleTargetGroupsServiceBase,
  ApplicationMultipleTargetGroupsServiceBaseProps,
} from '../base/application-multiple-target-groups-service-base';
import { FargateServiceBaseProps } from '../base/fargate-service-base';

/**
 * The properties for the ApplicationMultipleTargetGroupsFargateService service.
 */
export interface ApplicationMultipleTargetGroupsFargateServiceProps extends ApplicationMultipleTargetGroupsServiceBaseProps, FargateServiceBaseProps {

  /**
   * Determines whether the service will be assigned a public IP address.
   *
   * @default false
   */
  readonly assignPublicIp?: boolean;
}

/**
 * A Fargate service running on an ECS cluster fronted by an application load balancer.
 */
@propertyInjectable
export class ApplicationMultipleTargetGroupsFargateService extends ApplicationMultipleTargetGroupsServiceBase {
  /**
   * Uniquely identifies this class.
   */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-ecs-patterns.ApplicationMultipleTargetGroupsFargateService';

  /**
   * Determines whether the service will be assigned a public IP address.
   */
  public readonly assignPublicIp: boolean;

  /**
   * The Fargate service in this construct.
   */
  public readonly service: FargateService;

  /**
   * The Fargate task definition in this construct.
   */
  public readonly taskDefinition: FargateTaskDefinition;

  /**
   * The default target group for the service.
   * @deprecated - Use `targetGroups` instead.
   */
  public readonly targetGroup: ApplicationTargetGroup;

  /**
   * Constructs a new instance of the ApplicationMultipleTargetGroupsFargateService class.
   */
  constructor(scope: Construct, id: string, props: ApplicationMultipleTargetGroupsFargateServiceProps = {}) {
    super(scope, id, props);

    this.assignPublicIp = props.assignPublicIp ?? false;

    if (props.taskDefinition && props.taskImageOptions) {
      throw new ValidationError('You must specify only one of TaskDefinition or TaskImageOptions.', this);
    } else if (props.taskDefinition) {
      this.taskDefinition = props.taskDefinition;
    } else if (props.taskImageOptions) {
      const taskImageOptions = props.taskImageOptions;
      this.taskDefinition = new FargateTaskDefinition(this, 'TaskDef', {
        memoryLimitMiB: props.memoryLimitMiB,
        cpu: props.cpu,
        ephemeralStorageGiB: props.ephemeralStorageGiB,
        executionRole: taskImageOptions.executionRole,
        taskRole: taskImageOptions.taskRole,
        family: taskImageOptions.family,
        runtimePlatform: props.runtimePlatform,
      });

      const containerName = taskImageOptions.containerName ?? 'web';
      const container = this.taskDefinition.addContainer(containerName, {
        image: taskImageOptions.image,
        logging: this.logDriver,
        environment: taskImageOptions.environment,
        secrets: taskImageOptions.secrets,
        dockerLabels: taskImageOptions.dockerLabels,
      });
      if (taskImageOptions.containerPorts) {
        for (const containerPort of taskImageOptions.containerPorts) {
          container.addPortMappings({
            containerPort,
          });
        }
      }
    } else {
      throw new ValidationError('You must specify one of: taskDefinition or image', this);
    }
    if (!this.taskDefinition.defaultContainer) {
      throw new ValidationError('At least one essential container must be specified', this);
    }
    if (this.taskDefinition.defaultContainer.portMappings.length === 0) {
      this.taskDefinition.defaultContainer.addPortMappings({
        containerPort: 80,
      });
    }

    this.service = this.createFargateService(props);
    if (props.targetGroups) {
      this.addPortMappingForTargets(this.taskDefinition.defaultContainer, props.targetGroups);
      this.targetGroup = this.registerECSTargets(this.service, this.taskDefinition.defaultContainer, props.targetGroups);
    } else {
      this.targetGroup = this.listener.addTargets('ECS', {
        targets: [this.service],
        port: this.taskDefinition.defaultContainer.portMappings[0].containerPort,
      });
    }
  }

  private createFargateService(props: ApplicationMultipleTargetGroupsFargateServiceProps): FargateService {
    const desiredCount = FeatureFlags.of(this).isEnabled(cxapi.ECS_REMOVE_DEFAULT_DESIRED_COUNT) ? this.internalDesiredCount : this.desiredCount;

    return new FargateService(this, 'Service', {
      cluster: this.cluster,
      desiredCount: desiredCount,
      taskDefinition: this.taskDefinition,
      assignPublicIp: this.assignPublicIp,
      serviceName: props.serviceName,
      healthCheckGracePeriod: props.healthCheckGracePeriod,
      propagateTags: props.propagateTags,
      enableECSManagedTags: props.enableECSManagedTags,
      cloudMapOptions: props.cloudMapOptions,
      platformVersion: props.platformVersion,
      enableExecuteCommand: props.enableExecuteCommand,
    });
  }
}
