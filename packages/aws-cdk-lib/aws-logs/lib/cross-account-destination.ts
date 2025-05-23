import { Construct } from 'constructs';
import { ILogGroup } from './log-group';
import { CfnDestination } from './logs.generated';
import { ILogSubscriptionDestination, LogSubscriptionDestinationConfig } from './subscription-filter';
import * as iam from '../../aws-iam';
import { ArnFormat } from '../../core';
import * as cdk from '../../core';
import { addConstructMetadata, MethodMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * Properties for a CrossAccountDestination
 */
export interface CrossAccountDestinationProps {
  /**
   * The name of the log destination.
   *
   * @default Automatically generated
   */
  readonly destinationName?: string;

  /**
   * The role to assume that grants permissions to write to 'target'.
   *
   * The role must be assumable by 'logs.{REGION}.amazonaws.com'.
   */
  readonly role: iam.IRole;

  /**
   * The log destination target's ARN
   */
  readonly targetArn: string;
}

/**
 * A new CloudWatch Logs Destination for use in cross-account scenarios
 *
 * CrossAccountDestinations are used to subscribe a Kinesis stream in a
 * different account to a CloudWatch Subscription.
 *
 * Consumers will hardly ever need to use this class. Instead, directly
 * subscribe a Kinesis stream using the integration class in the
 * `aws-cdk-lib/aws-logs-destinations` package; if necessary, a
 * `CrossAccountDestination` will be created automatically.
 *
 * @resource AWS::Logs::Destination
 */
@propertyInjectable
export class CrossAccountDestination extends cdk.Resource implements ILogSubscriptionDestination {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-logs.CrossAccountDestination';
  /**
   * Policy object of this CrossAccountDestination object
   */
  public readonly policyDocument: iam.PolicyDocument = new iam.PolicyDocument();

  /**
   * The name of this CrossAccountDestination object
   * @attribute
   */
  public readonly destinationName: string;

  /**
   * The ARN of this CrossAccountDestination object
   * @attribute
   */
  public readonly destinationArn: string;

  /**
   * The inner resource
   */
  private readonly resource: CfnDestination;

  constructor(scope: Construct, id: string, props: CrossAccountDestinationProps) {
    super(scope, id, {
      physicalName: props.destinationName ||
        // In the underlying model, the name is not optional, but we make it so anyway.
        cdk.Lazy.string({ produce: () => this.generateUniqueName() }),
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.resource = new CfnDestination(this, 'Resource', {
      destinationName: this.physicalName!,
      // Must be stringified policy
      destinationPolicy: this.lazyStringifiedPolicyDocument(),
      roleArn: props.role.roleArn,
      targetArn: props.targetArn,
    });

    this.destinationArn = this.getResourceArnAttribute(this.resource.attrArn, {
      service: 'logs',
      resource: 'destination',
      resourceName: this.physicalName,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    this.destinationName = this.getResourceNameAttribute(this.resource.ref);
  }

  @MethodMetadata()
  public addToPolicy(statement: iam.PolicyStatement) {
    this.policyDocument.addStatements(statement);
  }

  @MethodMetadata()
  public bind(_scope: Construct, _sourceLogGroup: ILogGroup): LogSubscriptionDestinationConfig {
    return { arn: this.destinationArn };
  }

  /**
   * Generate a unique Destination name in case the user didn't supply one
   */
  private generateUniqueName(): string {
    // Combination of stack name and LogicalID, which are guaranteed to be unique.
    return cdk.Stack.of(this).stackName + '-' + this.resource.logicalId;
  }

  /**
   * Return a stringified JSON version of the PolicyDocument
   */
  private lazyStringifiedPolicyDocument(): string {
    return cdk.Lazy.string({
      produce: () =>
        this.policyDocument.isEmpty ? '' : cdk.Stack.of(this).toJsonString(this.policyDocument),
    });
  }
}
