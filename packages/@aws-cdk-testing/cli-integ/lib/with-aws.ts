// eslint-disable-next-line import/no-extraneous-dependencies
import { AtmosphereClient } from '@cdklabs/cdk-atmosphere-client';
import { AwsClients } from './aws';
import { TestContext } from './integ-test';
import { ResourcePool } from './resource-pool';
import { DisableBootstrapContext } from './with-cdk-app';

export type AwsContext = { readonly aws: AwsClients };

// will cause all aws environments to be allocated from the atmosphere service
// instead of the static local region pool.
const CDK_ATMOSPHERE_ENABLED = process.env.CDK_INTEG_ATMOSPHERE_ENABLED ? true : false;
const CDK_ATMOSPHERE_ENDPOINT = process.env.CDK_INTEG_ATMOSPHERE_ENDPOINT;

/**
 * Higher order function to execute a block with an AWS client setup
 *
 * Allocate the next region from the REGION pool and dispose it afterwards.
 */
export function withAws<A extends TestContext>(
  block: (context: A & AwsContext & DisableBootstrapContext) => Promise<void>,
  disableBootstrap: boolean = false,
): (context: A) => Promise<void> {

  return async (context: A) => {

    if (CDK_ATMOSPHERE_ENABLED) {

      if (!CDK_ATMOSPHERE_ENDPOINT) {
        throw new Error('CDK_INTEG_ATMOSPHERE_ENABLED is set but CDK_INTEG_ATMOSPHERE_ENDPOINT is not');
      }

      const atmosphere = new AtmosphereClient(CDK_ATMOSPHERE_ENDPOINT);
      const allocation = await atmosphere.acquire({ pool: 'pool-1', requester: context.name, timeoutMinutes: 15 });
      const aws = await AwsClients.forEnvironment(allocation.environment, {
        accessKeyId: allocation.credentials.accessKeyId,
        secretAccessKey: allocation.credentials.secretAccessKey,
        sessionToken: allocation.credentials.sessionToken,
        accountId: allocation.environment.account,
      }, context.output);

      await sanityCheck(aws);

      try {
        const result = await block({ ...context, disableBootstrap, aws });
        await atmosphere.release(allocation.id, 'success');
        return result;
      } catch (e: any) {
        await atmosphere.release(allocation.id, 'failure');
        throw e;
      }
    } else {
      return regionPool().using(async (region) => {
        const aws = await AwsClients.forRegion(region, context.output);
        await sanityCheck(aws);
        return block({ ...context, disableBootstrap, aws });
      });
    }
  };
}

let _regionPool: undefined | ResourcePool;
export function regionPool(): ResourcePool {
  if (_regionPool !== undefined) {
    return _regionPool;
  }

  const REGIONS = process.env.AWS_REGIONS
    ? process.env.AWS_REGIONS.split(',')
    : [process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1'];

  // eslint-disable-next-line no-console
  console.log(`Using regions: ${REGIONS}\n`);

  _regionPool = ResourcePool.withResources('aws_regions', REGIONS);
  return _regionPool;
}

/**
 * Perform a one-time quick sanity check that the AWS clients have properly configured credentials
 *
 * If we don't do this, calls are going to fail and they'll be retried and everything will take
 * forever before the user notices a simple misconfiguration.
 *
 * We can't check for the presence of environment variables since credentials could come from
 * anywhere, so do simple account retrieval.
 *
 * Only do it once per process.
 */
async function sanityCheck(aws: AwsClients) {
  if (sanityChecked === undefined) {
    try {
      await aws.account();
      sanityChecked = true;
    } catch (e: any) {
      sanityChecked = false;
      throw new Error(`AWS credentials probably not configured, got error: ${e.message}`);
    }
  }
  if (!sanityChecked) {
    throw new Error('AWS credentials probably not configured, see previous error');
  }
}
let sanityChecked: boolean | undefined;
