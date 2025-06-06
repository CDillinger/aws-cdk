import { Template, Match } from '../../assertions';
import * as iam from '../../aws-iam';
import * as firehose from '../../aws-kinesisfirehose';
import * as logs from '../../aws-logs';
import * as s3 from '../../aws-s3';
import { RemovalPolicy, Stack } from '../../core';
import { FlowLog, FlowLogDestination, FlowLogResourceType, FlowLogMaxAggregationInterval, LogFormat, Vpc, FlowLogTrafficType } from '../lib';

describe('vpc flow logs', () => {
  test('with defaults set, it successfully creates with cloudwatch logs destination', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'NetworkInterface',
      TrafficType: 'ALL',
      ResourceId: 'eni-123455',
      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
      },
      LogGroupName: {
        Ref: 'FlowLogsLogGroup9853A85F',
      },
    });

    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 1);
    Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
    Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 0);
  });
  test('with cloudwatch logs as the destination, allows use of existing resources', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toCloudWatchLogs(
        new logs.LogGroup(stack, 'TestLogGroup', {
          retention: logs.RetentionDays.FIVE_DAYS,
        }),
        new iam.Role(stack, 'TestRole', {
          roleName: 'TestName',
          assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
        }),
      ),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 5,
    });
    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'TestName',
    });
    Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 0);
  });
  test('with s3 as the destination, allows use of existing resources', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toS3(
        new s3.Bucket(stack, 'TestBucket', {
          bucketName: 'testbucket',
        }),
      ),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      DestinationOptions: Match.absent(),
    });
    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 0);
    Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 0);
    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'testbucket',
    });
  });

  test('with Amazon Data Firehose deliveryStreamArn as the destination, allows use of existing resources', () => {
    const stack = getTestStack();

    const deliveryStreamArn = Stack.of(stack).formatArn({
      resource: 'deliverystream',
      region: '',
      service: 'firehose',
      account: '',
      resourceName: 'testdeliverystream',
    });
    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toKinesisDataFirehoseDestination(
        deliveryStreamArn,
      ),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      DestinationOptions: Match.absent(),
      LogDestinationType: 'kinesis-data-firehose',
      LogDestination: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':firehose:::deliverystream/testdeliverystream']] },
    });
    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 0);
    Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 0);
  });

  test('with Amazon Data Firehose delivery stream as the destination, allows use of existing resources', () => {
    const stack = getTestStack();

    const bucket = new s3.Bucket(stack, 'Bucket');
    const deliveryStream = new firehose.DeliveryStream(stack, 'DeliveryStream', {
      destination: new firehose.S3Bucket(bucket, {
        loggingConfig: new firehose.DisableLogging(),
      }),
    });
    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toFirehose(deliveryStream),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      DestinationOptions: Match.absent(),
      LogDestinationType: 'kinesis-data-firehose',
      LogDestination: { 'Fn::GetAtt': ['DeliveryStream58CF96DB', 'Arn'] },
    });
    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 0);
    Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 1);
  });

  test('with Amazon Data Firehose delivery stream as the destination with cross-account log delivery', () => {
    const stack = getTestStack();

    const bucket = new s3.Bucket(stack, 'Bucket');
    const deliveryStream = new firehose.DeliveryStream(stack, 'DeliveryStream', {
      destination: new firehose.S3Bucket(bucket, {
        loggingConfig: new firehose.DisableLogging(),
      }),
    });
    const role = new iam.Role(stack, 'Role', {
      assumedBy: new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
    });
    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toFirehose(deliveryStream, role),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      DestinationOptions: Match.absent(),
      LogDestinationType: 'kinesis-data-firehose',
      LogDestination: { 'Fn::GetAtt': ['DeliveryStream58CF96DB', 'Arn'] },
      DeliverLogsPermissionArn: { 'Fn::GetAtt': ['Role1ABCC5F0', 'Arn'] },
    });
  });

  test('toFirehose() throws when cross-account delivery and iamRole is missing', () => {
    const stack = getTestStack();
    const bucket = new s3.Bucket(stack, 'Bucket');

    const crossAccountStack = new Stack(undefined, 'CrossAccountStack', {
      env: { account: '234567890123', region: 'us-east-1' },
    });
    const deliveryStream = new firehose.DeliveryStream(crossAccountStack, 'DeliveryStream', {
      destination: new firehose.S3Bucket(bucket, {
        loggingConfig: new firehose.DisableLogging(),
      }),
    });

    expect(() => {
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
        destination: FlowLogDestination.toFirehose(deliveryStream),
      });
    }).toThrow('The iamRole is required for cross-account log delivery.');
  });

  test('with flowLogName, adds Name tag with the name', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
      flowLogName: 'CustomFlowLogName',
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      Tags: [
        {
          Key: 'Name',
          Value: 'CustomFlowLogName',
        },
      ],
    });
  });

  test('allows setting destination options', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toS3(undefined, undefined, {
        hiveCompatiblePartitions: true,
      }),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'NetworkInterface',
      TrafficType: 'ALL',
      ResourceId: 'eni-123456',
      DestinationOptions: {
        hiveCompatiblePartitions: true,
        fileFormat: 'plain-text',
        perHourPartition: false,
      },
      LogDestination: {
        'Fn::GetAtt': [
          'FlowLogsBucket87F67F60',
          'Arn',
        ],
      },
      LogDestinationType: 's3',
    });
  });

  describe('s3 bucket policy - @aws-cdk/aws-s3:createDefaultLoggingPolicy feature flag', () => {
    test('creates default S3 bucket policy with options', () => {
      const stack = new Stack();
      stack.node.setContext('@aws-cdk/aws-s3:createDefaultLoggingPolicy', true);
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
        destination: FlowLogDestination.toS3(undefined, 'custom-prefix', {
          hiveCompatiblePartitions: true,
        }),
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 's3:PutObject',
              Effect: 'Allow',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                  'aws:SourceAccount': {
                    Ref: 'AWS::AccountId',
                  },
                },
                ArnLike: {
                  'aws:SourceArn': {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':logs:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':*',
                      ],
                    ],
                  },
                },
              },
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'FlowLogsBucket87F67F60',
                        'Arn',
                      ],
                    },
                    '/custom-prefix/AWSLogs/aws-account-id=',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: [
                's3:GetBucketAcl',
                's3:ListBucket',
              ],
              Condition: {
                StringEquals: {
                  'aws:SourceAccount': {
                    Ref: 'AWS::AccountId',
                  },
                },
                ArnLike: {
                  'aws:SourceArn': {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':logs:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':*',
                      ],
                    ],
                  },
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::GetAtt': [
                  'FlowLogsBucket87F67F60',
                  'Arn',
                ],
              },
            },
          ],
        },
      });
    });

    test('creates default S3 bucket policy', () => {
      const stack = new Stack();
      stack.node.setContext('@aws-cdk/aws-s3:createDefaultLoggingPolicy', true);
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
        destination: FlowLogDestination.toS3(),
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 's3:PutObject',
              Effect: 'Allow',
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                  'aws:SourceAccount': {
                    Ref: 'AWS::AccountId',
                  },
                },
                ArnLike: {
                  'aws:SourceArn': {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':logs:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':*',
                      ],
                    ],
                  },
                },
              },
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    {
                      'Fn::GetAtt': [
                        'FlowLogsBucket87F67F60',
                        'Arn',
                      ],
                    },
                    '/AWSLogs/',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/*',
                  ],
                ],
              },
            },
            {
              Action: [
                's3:GetBucketAcl',
                's3:ListBucket',
              ],
              Condition: {
                StringEquals: {
                  'aws:SourceAccount': {
                    Ref: 'AWS::AccountId',
                  },
                },
                ArnLike: {
                  'aws:SourceArn': {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':logs:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':*',
                      ],
                    ],
                  },
                },
              },
              Effect: 'Allow',
              Principal: {
                Service: 'delivery.logs.amazonaws.com',
              },
              Resource: {
                'Fn::GetAtt': [
                  'FlowLogsBucket87F67F60',
                  'Arn',
                ],
              },
            },
          ],
        },
      });
    });

    test('adds necessary dependencies', () => {
      const stack = new Stack();
      stack.node.setContext('@aws-cdk/aws-s3:createDefaultLoggingPolicy', true);
      const bucket = new s3.Bucket(stack, 'Bucket', {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
      });
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
        destination: FlowLogDestination.toS3(bucket),
      });

      const template = Template.fromStack(stack);
      template.hasResource('AWS::EC2::FlowLog', {
        Properties: Match.anyValue(),
        DependsOn: [
          'BucketAutoDeleteObjectsCustomResourceBAFD23C2',
          'BucketPolicyE9A3008A',
        ],
      });
    });

    test('without future flag, does not create default bucket policy', () => {
      const stack = new Stack();
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
        destination: FlowLogDestination.toS3(),
      });

      Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 0);
    });
  });

  test('with s3 as the destination, allows use of key prefix', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toS3(
        new s3.Bucket(stack, 'TestBucket', {
          bucketName: 'testbucket',
        }),
        'FlowLogs/',
      ),
    });

    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 0);
    Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 0);
    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'testbucket',
    });
  });
  test('with s3 as the destination and all the defaults set, it successfully creates all the resources', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123456'),
      destination: FlowLogDestination.toS3(),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'NetworkInterface',
      TrafficType: 'ALL',
      ResourceId: 'eni-123456',
      LogDestination: {
        'Fn::GetAtt': ['FlowLogsBucket87F67F60', 'Arn'],
      },
    });
    Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 0);
    Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 0);
    Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 1);
  });
  test('create with vpc', () => {
    const stack = getTestStack();

    new Vpc(stack, 'VPC', {
      flowLogs: {
        flowLogs: {},
      },
    });

    Template.fromStack(stack).resourceCountIs('AWS::EC2::VPC', 1);
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      TrafficType: 'ALL',
      ResourceId: {
        Ref: 'VPCB9E5F0B4',
      },
      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['VPCflowLogsIAMRole9D21E1A6', 'Arn'],
      },
      LogGroupName: {
        Ref: 'VPCflowLogsLogGroupE900F980',
      },
    });
  });
  test('add to vpc', () => {
    const stack = getTestStack();

    const vpc = new Vpc(stack, 'VPC');
    vpc.addFlowLog('FlowLogs');

    Template.fromStack(stack).resourceCountIs('AWS::EC2::VPC', 1);
    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      TrafficType: 'ALL',
      ResourceId: {
        Ref: 'VPCB9E5F0B4',
      },
      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['VPCFlowLogsIAMRole55343234', 'Arn'],
      },
      LogGroupName: {
        Ref: 'VPCFlowLogsLogGroupF48E1B0A',
      },
    });
  });
  test('flowlog has defaultchild', () => {
    const stack = new Stack();
    const vpc = new Vpc(stack, 'VPC');

    const flowlog = new FlowLog(stack, 'FlowLog', {
      resourceType: FlowLogResourceType.fromVpc(vpc),
    });

    expect(flowlog.node.defaultChild).toBeDefined();
  });
  test('flowlog change maxAggregationInterval', () => {
    const stack = new Stack();
    const vpc = new Vpc(stack, 'VPC');

    new FlowLog(stack, 'FlowLog', {
      resourceType: FlowLogResourceType.fromVpc(vpc),
      maxAggregationInterval: FlowLogMaxAggregationInterval.ONE_MINUTE,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      TrafficType: 'ALL',

      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['FlowLogIAMRoleDCBD2EB4', 'Arn'],
      },
      LogDestinationType: 'cloud-watch-logs',
      LogGroupName: {
        Ref: 'FlowLogLogGroupAFFB9038',
      },
      MaxAggregationInterval: 60,
    });
  });

  test('create from transit gateway`', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromTransitGatewayId('tgw-123456'),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'TransitGateway',
      ResourceId: 'tgw-123456',
      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
      },
      LogGroupName: {
        Ref: 'FlowLogsLogGroup9853A85F',
      },
    });
  });

  test('throw if transit gateway with traffic type', () => {
    const stack = getTestStack();

    expect(() => {
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromTransitGatewayId('tgw-123456'),
        trafficType: FlowLogTrafficType.REJECT,
      });
    }).toThrow(/trafficType is not supported for Transit Gateway and Transit Gateway Attachment/);
  });

  test('create from transit gateway attachment', () => {
    const stack = getTestStack();

    new FlowLog(stack, 'FlowLogs', {
      resourceType: FlowLogResourceType.fromTransitGatewayAttachmentId('tgw-attach-123456'),
    });

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'TransitGatewayAttachment',
      ResourceId: 'tgw-attach-123456',
      DeliverLogsPermissionArn: {
        'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
      },
      LogGroupName: {
        Ref: 'FlowLogsLogGroup9853A85F',
      },
    });
  });

  test('throw if transit gateway attachment with traffic type', () => {
    const stack = getTestStack();

    expect(() => {
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromTransitGatewayAttachmentId('tgw-attach-123456'),
        trafficType: FlowLogTrafficType.REJECT,
      });
    }).toThrow(/trafficType is not supported for Transit Gateway and Transit Gateway Attachment/);
  });

  test('throw if transit gateway with value other than maxAggregationInterval.ONE_MINUTES', () => {
    const stack = getTestStack();

    expect(() => {
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromTransitGatewayId('tgw-123456'),
        maxAggregationInterval: FlowLogMaxAggregationInterval.TEN_MINUTES,
      });
    }).toThrow(/maxAggregationInterval must be set to ONE_MINUTE for Transit Gateway and Transit Gateway Attachment/);
  });

  test('throw if transit gateway attachment with maxAggregationInterval value other than maxAggregationInterval.ONE_MINUTES', () => {
    const stack = getTestStack();

    expect(() => {
      new FlowLog(stack, 'FlowLogs', {
        resourceType: FlowLogResourceType.fromTransitGatewayAttachmentId('tgw-attach-123456'),
        maxAggregationInterval: FlowLogMaxAggregationInterval.TEN_MINUTES,
      });
    }).toThrow(/maxAggregationInterval must be set to ONE_MINUTE for Transit Gateway and Transit Gateway Attachment/);
  });
});

test('add to vpc with maxAggregationInterval', () => {
  const stack = getTestStack();

  const vpc = new Vpc(stack, 'VPC');
  vpc.addFlowLog('FlowLogs', {
    maxAggregationInterval: FlowLogMaxAggregationInterval.ONE_MINUTE,
  });

  Template.fromStack(stack).resourceCountIs('AWS::EC2::VPC', 1);
  Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
    ResourceType: 'VPC',
    TrafficType: 'ALL',
    ResourceId: {
      Ref: 'VPCB9E5F0B4',
    },
    DeliverLogsPermissionArn: {
      'Fn::GetAtt': ['VPCFlowLogsIAMRole55343234', 'Arn'],
    },
    LogGroupName: {
      Ref: 'VPCFlowLogsLogGroupF48E1B0A',
    },
    MaxAggregationInterval: 60,
  });
});

test('with custom log format set, it successfully creates with cloudwatch log destination', () => {
  const stack = getTestStack();

  new FlowLog(stack, 'FlowLogs', {
    resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
    logFormat: [
      LogFormat.SRC_PORT,
      LogFormat.DST_PORT,
    ],
  });

  Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
    ResourceType: 'NetworkInterface',
    TrafficType: 'ALL',
    ResourceId: 'eni-123455',
    DeliverLogsPermissionArn: {
      'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
    },
    LogFormat: '${srcport} ${dstport}',
    LogGroupName: {
      Ref: 'FlowLogsLogGroup9853A85F',
    },
  });
});

test('log format for built-in types is correct', () => {
  const stack = getTestStack();

  const vpc = new Vpc(stack, 'TestVpc');
  new FlowLog(stack, 'FlowLogs1', {
    resourceType: FlowLogResourceType.fromVpc(vpc),
    logFormat: [
      LogFormat.VERSION,
      LogFormat.ACCOUNT_ID,
      LogFormat.INTERFACE_ID,
      LogFormat.SRC_ADDR,
      LogFormat.DST_ADDR,
      LogFormat.SRC_PORT,
      LogFormat.DST_PORT,
      LogFormat.PROTOCOL,
      LogFormat.PACKETS,
      LogFormat.BYTES,
      LogFormat.START_TIMESTAMP,
      LogFormat.END_TIMESTAMP,
      LogFormat.ACTION,
      LogFormat.LOG_STATUS,
      LogFormat.VPC_ID,
      LogFormat.SUBNET_ID,
      LogFormat.INSTANCE_ID,
      LogFormat.TCP_FLAGS,
      LogFormat.TRAFFIC_TYPE,
      LogFormat.PKT_SRC_ADDR,
      LogFormat.PKT_DST_ADDR,
      LogFormat.REGION,
      LogFormat.AZ_ID,
      LogFormat.SUBLOCATION_TYPE,
      LogFormat.SUBLOCATION_ID,
      LogFormat.PKT_SRC_AWS_SERVICE,
      LogFormat.PKT_DST_AWS_SERVICE,
      LogFormat.FLOW_DIRECTION,
      LogFormat.TRAFFIC_PATH,
      LogFormat.ECS_CLUSTER_ARN,
      LogFormat.ECS_CLUSTER_NAME,
      LogFormat.ECS_CONTAINER_INSTANCE_ARN,
      LogFormat.ECS_CONTAINER_INSTANCE_ID,
      LogFormat.ECS_CONTAINER_ID,
      LogFormat.ECS_SECOND_CONTAINER_ID,
      LogFormat.ECS_SERVICE_NAME,
      LogFormat.ECS_TASK_DEFINITION_ARN,
      LogFormat.ECS_TASK_ARN,
      LogFormat.ECS_TASK_ID,
    ],
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::EC2::FlowLog', {
    LogFormat: ('${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} '
                + '${dstport} ${protocol} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} '
                + '${vpc-id} ${subnet-id} ${instance-id} ${tcp-flags} ${type} ${pkt-srcaddr} '
                + '${pkt-dstaddr} ${region} ${az-id} ${sublocation-type} ${sublocation-id} '
                + '${pkt-src-aws-service} ${pkt-dst-aws-service} ${flow-direction} ${traffic-path} '
                + '${ecs-cluster-arn} ${ecs-cluster-name} ${ecs-container-instance-arn} ${ecs-container-instance-id} '
                + '${ecs-container-id} ${ecs-second-container-id} ${ecs-service-name} ${ecs-task-definition-arn} '
                + '${ecs-task-arn} ${ecs-task-id}'),
  });
});

test('with custom log format set empty, it not creates with cloudwatch log destination', () => {
  const stack = getTestStack();

  new FlowLog(stack, 'FlowLogs', {
    resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
    logFormat: [],
  });

  Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
    ResourceType: 'NetworkInterface',
    TrafficType: 'ALL',
    ResourceId: 'eni-123455',
    DeliverLogsPermissionArn: {
      'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
    },
    LogGroupName: {
      Ref: 'FlowLogsLogGroup9853A85F',
    },
  });
});

function getTestStack(): Stack {
  return new Stack(undefined, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
}

test('with custom log format set all default field, it not creates with cloudwatch log destination', () => {
  const stack = getTestStack();

  new FlowLog(stack, 'FlowLogs', {
    resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
    logFormat: [
      LogFormat.VERSION,
      LogFormat.ALL_DEFAULT_FIELDS,
    ],
  });

  Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
    ResourceType: 'NetworkInterface',
    TrafficType: 'ALL',
    ResourceId: 'eni-123455',
    DeliverLogsPermissionArn: {
      'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
    },
    LogFormat: '${version} ${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${start} ${end} ${action} ${log-status}',
    LogGroupName: {
      Ref: 'FlowLogsLogGroup9853A85F',
    },
  });
});

test('with custom log format set custom, it not creates with cloudwatch log destination', () => {
  const stack = getTestStack();

  new FlowLog(stack, 'FlowLogs', {
    resourceType: FlowLogResourceType.fromNetworkInterfaceId('eni-123455'),
    logFormat: [
      LogFormat.SRC_PORT,
      LogFormat.custom('${new-field}'),
    ],
  });

  Template.fromStack(stack).hasResourceProperties('AWS::EC2::FlowLog', {
    ResourceType: 'NetworkInterface',
    TrafficType: 'ALL',
    ResourceId: 'eni-123455',
    DeliverLogsPermissionArn: {
      'Fn::GetAtt': ['FlowLogsIAMRoleF18F4209', 'Arn'],
    },
    LogFormat: '${srcport} ${new-field}',
    LogGroupName: {
      Ref: 'FlowLogsLogGroup9853A85F',
    },
  });
});
