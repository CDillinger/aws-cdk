import { Template } from '../../assertions';
import { App, Stack } from '../../core';
import * as ec2 from '../lib';

let app: App;
let stack: Stack;

beforeEach(() => {
  app = new App();
  stack = new Stack(app, 'Stack', {
    env: { account: '1234', region: 'testregion' },
  });
});

test('can make and use a Linux image', () => {
  // WHEN
  const image = new ec2.GenericLinuxImage({
    testregion: 'ami-1234',
  });

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toEqual('ami-1234');
  expect(details.osType).toEqual(ec2.OperatingSystemType.LINUX);
});

test('can make and use a Linux image in agnostic stack', () => {
  // WHEN
  app = new App();
  stack = new Stack(app, 'Stack');
  const image = new ec2.GenericLinuxImage({
    testregion: 'ami-1234',
  });

  // THEN
  const details = image.getImage(stack);
  const expected = {
    Mappings: {
      AmiMap: {
        testregion: {
          ami: 'ami-1234',
        },
      },
    },
  };

  Template.fromStack(stack).templateMatches(expected);
  expect(stack.resolve(details.imageId)).toEqual({ 'Fn::FindInMap': ['AmiMap', { Ref: 'AWS::Region' }, 'ami'] });
  expect(details.osType).toEqual(ec2.OperatingSystemType.LINUX);
});

test('can make and use a Windows image', () => {
  // WHEN
  const image = new ec2.GenericWindowsImage({
    testregion: 'ami-1234',
  });

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toEqual('ami-1234');
  expect(details.osType).toEqual(ec2.OperatingSystemType.WINDOWS);
});

test('can make and use a Windows image in agnostic stack', () => {
  // WHEN
  app = new App();
  stack = new Stack(app, 'Stack');
  const image = new ec2.GenericWindowsImage({
    testregion: 'ami-1234',
  });

  // THEN
  const details = image.getImage(stack);
  const expected = {
    Mappings: {
      AmiMap: {
        testregion: {
          ami: 'ami-1234',
        },
      },
    },
  };

  Template.fromStack(stack).templateMatches(expected);
  expect(stack.resolve(details.imageId)).toEqual({ 'Fn::FindInMap': ['AmiMap', { Ref: 'AWS::Region' }, 'ami'] });
  expect(details.osType).toEqual(ec2.OperatingSystemType.WINDOWS);
});

test('can make and use a Generic SSM image', () => {
  // WHEN
  const image = new ec2.GenericSSMParameterImage('testParam', ec2.OperatingSystemType.LINUX);

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toContain('TOKEN');
  expect(details.osType).toEqual(ec2.OperatingSystemType.LINUX);
});

test('can make and use a SSM resolve image', () => {
  // WHEN
  const image = new ec2.ResolveSsmParameterAtLaunchImage('testParam');

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toEqual('resolve:ssm:testParam');
  expect(details.osType).toEqual(ec2.OperatingSystemType.LINUX);
});

test('can make and use a SSM resolve image with parameter version', () => {
  // WHEN
  const image = new ec2.ResolveSsmParameterAtLaunchImage('testParam', { parameterVersion: '2' });

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toEqual('resolve:ssm:testParam:2');
});

test('can make and use a SSM resolve image with resolveSsmParameterAtLaunch', () => {
  // WHEN
  const image = ec2.MachineImage.resolveSsmParameterAtLaunch('testParam', { parameterVersion: '2' });

  // THEN
  const details = image.getImage(stack);
  expect(details.imageId).toEqual('resolve:ssm:testParam:2');
});

test('WindowsImage retains userdata if given', () => {
  // WHEN
  const ud = ec2.UserData.forWindows();

  const image = new ec2.GenericWindowsImage({
    testregion: 'ami-1234',
  }, {
    userData: ud,
  });

  // THEN
  const details = image.getImage(stack);
  expect(details.userData).toEqual(ud);
});

test('WindowsImage creates UserData if not given', () => {
  // WHEN
  const image = new ec2.GenericWindowsImage({
    testregion: 'ami-1234',
  });

  // THEN
  const details = image.getImage(stack);
  expect(isWindowsUserData(details.userData)).toBeTruthy();
});

test('LookupMachineImage default search', () => {
  // GIVEN

  // WHEN
  new ec2.LookupMachineImage({ name: 'bla*', owners: ['amazon'] }).getImage(stack);

  // THEN
  const missing = app.synth().manifest.missing || [];
  expect(missing).toEqual([
    {
      key: 'ami:account=1234:filters.image-type.0=machine:filters.name.0=bla*:filters.state.0=available:owners.0=amazon:region=testregion',
      props: {
        account: '1234',
        dummyValue: 'ami-1234',
        region: 'testregion',
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        owners: ['amazon'],
        filters: {
          'name': ['bla*'],
          'state': ['available'],
          'image-type': ['machine'],
        },
      },
      provider: 'ami',
    },
  ]);
});

test('LookupMachineImage creates correct type of UserData', () => {
  // WHEN
  const linuxDetails = new ec2.LookupMachineImage({ name: 'bla*', owners: ['amazon'] }).getImage(stack);
  const windowsDetails = new ec2.LookupMachineImage({ name: 'bla*', owners: ['amazon'], windows: true }).getImage(stack);

  // THEN
  expect(isWindowsUserData(windowsDetails.userData)).toBeTruthy();
  expect(isLinuxUserData(linuxDetails.userData)).toBeTruthy();
});

test('cached lookups of Amazon Linux', () => {
  // WHEN
  const ami = ec2.MachineImage.latestAmazonLinux({ cachedInContext: true }).getImage(stack).imageId;

  // THEN
  expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2');
  expect(app.synth().manifest.missing).toEqual([
    {
      key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2:region=testregion',
      props: {
        account: '1234',
        dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2',
        ignoreErrorOnMissingContext: false,
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        region: 'testregion',
        parameterName: '/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2',
      },
      provider: 'ssm',
    },
  ]);
});

test('cached lookups of Amazon Linux linked to scope', () => {
  // WHEN
  const ami = ec2.MachineImage.latestAmazonLinux({ cachedInContext: true, additionalCacheKey: 'extraKey' }).getImage(stack).imageId;

  // THEN
  expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2');
  expect(app.synth().manifest.missing).toEqual([
    {
      key: 'ssm:account=1234:additionalCacheKey=extraKey:parameterName=/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2:region=testregion',
      props: {
        account: '1234',
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        region: 'testregion',
        parameterName: '/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2',
        additionalCacheKey: 'extraKey',
        dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn-ami-hvm-x86_64-gp2',
        ignoreErrorOnMissingContext: false,
      },
      provider: 'ssm',
    },
  ]);
});

test('cached lookups of Amazon Linux 2', () => {
  // WHEN
  const ami = ec2.MachineImage.latestAmazonLinux({
    cachedInContext: true,
    generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
  }).getImage(stack).imageId;

  // THEN
  expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2');
  expect(app.synth().manifest.missing).toEqual([
    {
      key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2:region=testregion',
      props: {
        account: '1234',
        dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
        ignoreErrorOnMissingContext: false,
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        region: 'testregion',
        parameterName: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2',
      },
      provider: 'ssm',
    },
  ]);
});

test('cached lookups of Amazon Linux 2 with kernel 5.x', () => {
  // WHEN
  const ami = ec2.MachineImage.latestAmazonLinux({
    cachedInContext: true,
    generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
    kernel: ec2.AmazonLinuxKernel.KERNEL5_X,
  }).getImage(stack).imageId;

  // THEN
  expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-x86_64-gp2');
  expect(app.synth().manifest.missing).toEqual([
    {
      key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-x86_64-gp2:region=testregion',
      props: {
        account: '1234',
        dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-x86_64-gp2',
        ignoreErrorOnMissingContext: false,
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        region: 'testregion',
        parameterName: '/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-x86_64-gp2',
      },
      provider: 'ssm',
    },
  ]);
});

test('throw error if storage param is set for Amazon Linux 2022', () => {
  expect(() => {
    ec2.MachineImage.latestAmazonLinux({
      cachedInContext: true,
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022,
      storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
    }).getImage(stack).imageId;
  }).toThrow(/Storage parameter does not exist in SSM parameter name for Amazon Linux 2022./);
});

test('throw error if virtualization param is set for Amazon Linux 2022', () => {
  expect(() => {
    ec2.MachineImage.latestAmazonLinux({
      cachedInContext: true,
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022,
      virtualization: ec2.AmazonLinuxVirt.HVM,
    }).getImage(stack).imageId;
  }).toThrow(/Virtualization parameter does not exist in SSM parameter name for Amazon Linux 2022./);
});

test('cached lookups of Amazon Linux 2022 with kernel 5.x', () => {
  // WHEN
  const ami = ec2.MachineImage.latestAmazonLinux({
    cachedInContext: true,
    generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2022,
  }).getImage(stack).imageId;

  // THEN
  expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-5.10-x86_64');
  expect(app.synth().manifest.missing).toEqual([
    {
      key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-5.10-x86_64:region=testregion',
      props: {
        account: '1234',
        dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-5.10-x86_64',
        ignoreErrorOnMissingContext: false,
        lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
        region: 'testregion',
        parameterName: '/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-5.10-x86_64',
      },
      provider: 'ssm',
    },
  ]);
});

describe('latest amazon linux', () => {
  test('latestAmazonLinux2', () => {
    // WHEN
    ec2.MachineImage.latestAmazonLinux2().getImage(stack);

    // THEN
    Template.fromStack(stack).hasParameter('*', {
      Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      Default: '/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-x86_64-gp2',
    });
  });

  test('AmazonLinux2ImageSsmParameter', () => {
    // WHEN
    const ami = new ec2.AmazonLinux2ImageSsmParameter({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      edition: ec2.AmazonLinuxEdition.MINIMAL,
      virtualization: ec2.AmazonLinuxVirt.PV,
      storage: ec2.AmazonLinuxStorage.EBS,
      kernel: ec2.AmazonLinux2Kernel.DEFAULT,
    }).getImage(stack).imageId;

    // THEN
    expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-pv-arm64-ebs');
    expect(app.synth().manifest.missing).toEqual([
      {
        key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-pv-arm64-ebs:region=testregion',
        props: {
          account: '1234',
          dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-pv-arm64-ebs',
          ignoreErrorOnMissingContext: false,
          lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
          region: 'testregion',
          parameterName: '/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-pv-arm64-ebs',
        },
        provider: 'ssm',
      },
    ]);
  });

  test('latestAmazonLinux2022', () => {
    // WHEN
    ec2.MachineImage.latestAmazonLinux2022().getImage(stack);

    // THEN
    Template.fromStack(stack).hasParameter('*', {
      Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      Default: '/aws/service/ami-amazon-linux-latest/al2022-ami-kernel-5.15-x86_64',
    });
  });

  test('AmazonLinux2022ImageSsmParameter', () => {
    // WHEN
    const ami = new ec2.AmazonLinux2022ImageSsmParameter({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      edition: ec2.AmazonLinuxEdition.MINIMAL,
      kernel: ec2.AmazonLinux2022Kernel.DEFAULT,
    }).getImage(stack).imageId;

    // THEN
    expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/al2022-ami-minimal-kernel-default-arm64');
    expect(app.synth().manifest.missing).toEqual([
      {
        key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/al2022-ami-minimal-kernel-default-arm64:region=testregion',
        props: {
          account: '1234',
          dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/al2022-ami-minimal-kernel-default-arm64',
          ignoreErrorOnMissingContext: false,
          lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
          region: 'testregion',
          parameterName: '/aws/service/ami-amazon-linux-latest/al2022-ami-minimal-kernel-default-arm64',
        },
        provider: 'ssm',
      },
    ]);
  });

  test('latestAmazonLinux2023', () => {
    // WHEN
    ec2.MachineImage.latestAmazonLinux2023().getImage(stack);

    // THEN
    Template.fromStack(stack).hasParameter('*', {
      Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      Default: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64',
    });
  });

  test('AmazonLinux2023ImageSsmParameter', () => {
    // WHEN
    const ami = new ec2.AmazonLinux2023ImageSsmParameter({
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      edition: ec2.AmazonLinuxEdition.MINIMAL,
      kernel: ec2.AmazonLinux2023Kernel.DEFAULT,
    }).getImage(stack).imageId;

    // THEN
    expect(ami).toEqual('dummy-value-for-/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-arm64');
    expect(app.synth().manifest.missing).toEqual([
      {
        key: 'ssm:account=1234:parameterName=/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-arm64:region=testregion',
        props: {
          account: '1234',
          dummyValue: 'dummy-value-for-/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-arm64',
          ignoreErrorOnMissingContext: false,
          lookupRoleArn: 'arn:${AWS::Partition}:iam::1234:role/cdk-hnb659fds-lookup-role-1234-testregion',
          region: 'testregion',
          parameterName: '/aws/service/ami-amazon-linux-latest/al2023-ami-minimal-kernel-default-arm64',
        },
        provider: 'ssm',
      },
    ]);
  });

  test('AmazonLinuxImage with AMAZON_LINUX_2023', () => {
    // WHEN
    new ec2.AmazonLinuxImage({ generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023 }).getImage(stack);

    // THEN
    Template.fromStack(stack).hasParameter('*', {
      Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
      Default: '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64',
    });
  });
});

test('throw error if storage param is set for Amazon Linux 2023', () => {
  expect(() => {
    new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
      storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
    }).getImage(stack);
  }).toThrow(/Storage parameter does not exist in SSM parameter name for Amazon Linux 2023./);
});

test('throw error if virtualization param is set for Amazon Linux 2023', () => {
  expect(() => {
    new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
      virtualization: ec2.AmazonLinuxVirt.HVM,
    }).getImage(stack);
  }).toThrow(/Virtualization parameter does not exist in SSM parameter name for Amazon Linux 2023./);
});

function isWindowsUserData(ud: ec2.UserData) {
  return ud.render().indexOf('powershell') > -1;
}

function isLinuxUserData(ud: ec2.UserData) {
  return ud.render().indexOf('bash') > -1;
}
