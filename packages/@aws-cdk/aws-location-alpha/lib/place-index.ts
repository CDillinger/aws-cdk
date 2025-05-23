import * as iam from 'aws-cdk-lib/aws-iam';
import { ArnFormat, IResource, Lazy, Resource, Stack, Token, UnscopedValidationError, ValidationError } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { CfnPlaceIndex } from 'aws-cdk-lib/aws-location';
import { DataSource, generateUniqueId } from './util';
import { addConstructMetadata, MethodMetadata } from 'aws-cdk-lib/core/lib/metadata-resource';
import { propertyInjectable } from 'aws-cdk-lib/core/lib/prop-injectable';

/**
 * A Place Index
 */
export interface IPlaceIndex extends IResource {
  /**
   * The name of the place index
   *
   * @attribute
   */
  readonly placeIndexName: string;

  /**
   * The Amazon Resource Name (ARN) of the place index resource
   *
   * @attribute Arn,IndexArn
   */
  readonly placeIndexArn: string;
}

/**
 * Properties for a place index
 */
export interface PlaceIndexProps {
  /**
   * A name for the place index
   *
   * Must be between 1 and 100 characters and contain only alphanumeric characters,
   * hyphens, periods and underscores.
   *
   * @default - A name is automatically generated
   */
  readonly placeIndexName?: string;

  /**
   * Data source for the place index
   *
   * @default DataSource.ESRI
   */
  readonly dataSource?: DataSource;

  /**
   * Intend use for the results of an operation
   *
   * @default IntendedUse.SINGLE_USE
   */
  readonly intendedUse?: IntendedUse;

  /**
   * A description for the place index
   *
   * @default - no description
   */
  readonly description?: string;
}

/**
 * Intend use for the results of an operation
 */
export enum IntendedUse {
  /**
   * The results won't be stored
   */
  SINGLE_USE = 'SingleUse',

  /**
   * The result can be cached or stored in a database
   */
  STORAGE = 'Storage',
}

/**
 * A Place Index
 *
 * @see https://docs.aws.amazon.com/location/latest/developerguide/places-concepts.html
 */
@propertyInjectable
export class PlaceIndex extends Resource implements IPlaceIndex {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = '@aws-cdk.aws-location-alpha.PlaceIndex';

  /**
   * Use an existing place index by name
   */
  public static fromPlaceIndexName(scope: Construct, id: string, placeIndexName: string): IPlaceIndex {
    const placeIndexArn = Stack.of(scope).formatArn({
      service: 'geo',
      resource: 'place-index',
      resourceName: placeIndexName,
    });

    return PlaceIndex.fromPlaceIndexArn(scope, id, placeIndexArn);
  }

  /**
   * Use an existing place index by ARN
   */
  public static fromPlaceIndexArn(scope: Construct, id: string, placeIndexArn: string): IPlaceIndex {
    const parsedArn = Stack.of(scope).splitArn(placeIndexArn, ArnFormat.SLASH_RESOURCE_NAME);

    if (!parsedArn.resourceName) {
      throw new UnscopedValidationError(`Place Index Arn ${placeIndexArn} does not have a resource name.`);
    }

    class Import extends Resource implements IPlaceIndex {
      public readonly placeIndexName = parsedArn.resourceName!;
      public readonly placeIndexArn = placeIndexArn;
    }

    return new Import(scope, id, {
      account: parsedArn.account,
      region: parsedArn.region,
    });
  }

  public readonly placeIndexName: string;

  public readonly placeIndexArn: string;

  /**
   * The timestamp for when the place index resource was created in ISO 8601 format
   *
   * @attribute
   */
  public readonly placeIndexCreateTime: string;

  /**
   * The timestamp for when the place index resource was last updated in ISO 8601 format
   *
   * @attribute
   */
  public readonly placeIndexUpdateTime: string;

  constructor(scope: Construct, id: string, props: PlaceIndexProps = {}) {
    super(scope, id, {
      physicalName: props.placeIndexName ?? Lazy.string({ produce: () => generateUniqueId(this) }),
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    if (props.description && !Token.isUnresolved(props.description) && props.description.length > 1000) {
      throw new ValidationError(`\`description\` must be between 0 and 1000 characters. Received: ${props.description.length} characters`, this);
    }

    if (props.placeIndexName !== undefined && !Token.isUnresolved(props.placeIndexName)) {
      if (props.placeIndexName.length < 1 || props.placeIndexName.length > 100) {
        throw new ValidationError(`\`placeIndexName\` must be between 1 and 100 characters, got: ${props.placeIndexName.length} characters.`, this);
      }

      if (!/^[-._\w]+$/.test(props.placeIndexName)) {
        throw new ValidationError(`\`placeIndexName\` must contain only alphanumeric characters, hyphens, periods and underscores, got: ${props.placeIndexName}.`, this);
      }
    }

    const placeIndex = new CfnPlaceIndex(this, 'Resource', {
      indexName: this.physicalName,
      dataSource: props.dataSource ?? DataSource.ESRI,
      dataSourceConfiguration: props.intendedUse
        ? { intendedUse: props.intendedUse }
        : undefined,
      description: props.description,
    });

    this.placeIndexName = placeIndex.ref;
    this.placeIndexArn = placeIndex.attrArn;
    this.placeIndexCreateTime = placeIndex.attrCreateTime;
    this.placeIndexUpdateTime = placeIndex.attrUpdateTime;
  }

  /**
   * Grant the given principal identity permissions to perform the actions on this place index.
   */
  @MethodMetadata()
  public grant(grantee: iam.IGrantable, ...actions: string[]): iam.Grant {
    return iam.Grant.addToPrincipal({
      grantee: grantee,
      actions: actions,
      resourceArns: [this.placeIndexArn],
    });
  }

  /**
   * Grant the given identity permissions to search using this index
   */
  @MethodMetadata()
  public grantSearch(grantee: iam.IGrantable): iam.Grant {
    return this.grant(grantee,
      'geo:SearchPlaceIndexForPosition',
      'geo:SearchPlaceIndexForSuggestions',
      'geo:SearchPlaceIndexForText',
    );
  }
}
