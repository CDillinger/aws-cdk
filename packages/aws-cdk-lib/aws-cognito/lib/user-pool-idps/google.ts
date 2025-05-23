import { Construct } from 'constructs';
import { UserPoolIdentityProviderProps } from './base';
import { UserPoolIdentityProviderBase } from './private/user-pool-idp-base';
import { SecretValue } from '../../../core';
import { ValidationError } from '../../../core/lib/errors';
import { addConstructMetadata } from '../../../core/lib/metadata-resource';
import { propertyInjectable } from '../../../core/lib/prop-injectable';
import { CfnUserPoolIdentityProvider } from '../cognito.generated';

/**
 * Properties to initialize UserPoolGoogleIdentityProvider
 */
export interface UserPoolIdentityProviderGoogleProps extends UserPoolIdentityProviderProps {
  /**
   * The client id recognized by Google APIs.
   * @see https://developers.google.com/identity/sign-in/web/sign-in#specify_your_apps_client_id
   */
  readonly clientId: string;
  /**
   * The client secret to be accompanied with clientId for Google APIs to authenticate the client.
   * @see https://developers.google.com/identity/sign-in/web/sign-in
   * @default none
   * @deprecated use clientSecretValue instead
   */
  readonly clientSecret?: string;
  /**
   * The client secret to be accompanied with clientId for Google APIs to authenticate the client as SecretValue
   * @see https://developers.google.com/identity/sign-in/web/sign-in
   * @default none
   */
  readonly clientSecretValue?: SecretValue;
  /**
   * The list of Google permissions to obtain for getting access to the Google profile
   * @see https://developers.google.com/identity/sign-in/web/sign-in
   * @default [ profile ]
   */
  readonly scopes?: string[];
}

/**
 * Represents an identity provider that integrates with Google
 * @resource AWS::Cognito::UserPoolIdentityProvider
 */
@propertyInjectable
export class UserPoolIdentityProviderGoogle extends UserPoolIdentityProviderBase {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-cognito.UserPoolIdentityProviderGoogle';
  public readonly providerName: string;

  constructor(scope: Construct, id: string, props: UserPoolIdentityProviderGoogleProps) {
    super(scope, id, props);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const scopes = props.scopes ?? ['profile'];

    // at least one of the properties must be configured
    if ((!props.clientSecret && !props.clientSecretValue) ||
      (props.clientSecret && props.clientSecretValue)) {
      throw new ValidationError('Exactly one of "clientSecret" or "clientSecretValue" must be configured.', this);
    }

    const resource = new CfnUserPoolIdentityProvider(this, 'Resource', {
      userPoolId: props.userPool.userPoolId,
      providerName: 'Google', // must be 'Google' when the type is 'Google'
      providerType: 'Google',
      providerDetails: {
        client_id: props.clientId,
        client_secret: props.clientSecretValue ? props.clientSecretValue.unsafeUnwrap() : props.clientSecret,
        authorize_scopes: scopes.join(' '),
      },
      attributeMapping: super.configureAttributeMapping(),
    });

    this.providerName = super.getResourceNameAttribute(resource.ref);
  }
}
