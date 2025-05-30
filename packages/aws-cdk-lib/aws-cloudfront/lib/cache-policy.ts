import { Construct } from 'constructs';
import { CfnCachePolicy } from './cloudfront.generated';
import { Duration, Names, Resource, Stack, Token, UnscopedValidationError, ValidationError, withResolved } from '../../core';
import { addConstructMetadata } from '../../core/lib/metadata-resource';
import { propertyInjectable } from '../../core/lib/prop-injectable';

/**
 * Represents a Cache Policy
 */
export interface ICachePolicy {
  /**
   * The ID of the cache policy
   * @attribute
   */
  readonly cachePolicyId: string;
}

/**
 * Properties for creating a Cache Policy
 */
export interface CachePolicyProps {
  /**
   * A unique name to identify the cache policy.
   * The name must only include '-', '_', or alphanumeric characters.
   * @default - generated from the `id`
   */
  readonly cachePolicyName?: string;

  /**
   * A comment to describe the cache policy.
   *
   * The comment cannot be longer than 128 characters.
   *
   * @default - no comment
   */
  readonly comment?: string;

  /**
   * The default amount of time for objects to stay in the CloudFront cache.
   * Only used when the origin does not send Cache-Control or Expires headers with the object.
   * @default - The greater of 1 day and ``minTtl``
   */
  readonly defaultTtl?: Duration;

  /**
   * The minimum amount of time for objects to stay in the CloudFront cache.
   * @default Duration.seconds(0)
   */
  readonly minTtl?: Duration;

  /**
   * The maximum amount of time for objects to stay in the CloudFront cache.
   * CloudFront uses this value only when the origin sends Cache-Control or Expires headers with the object.
   * @default - The greater of 1 year and ``defaultTtl``
   */
  readonly maxTtl?: Duration;

  /**
   * Determines whether any cookies in viewer requests are included in the cache key and automatically included in requests that CloudFront sends to the origin.
   * @default CacheCookieBehavior.none()
   */
  readonly cookieBehavior?: CacheCookieBehavior;

  /**
   * Determines whether any HTTP headers are included in the cache key and automatically included in requests that CloudFront sends to the origin.
   * @default CacheHeaderBehavior.none()
   */
  readonly headerBehavior?: CacheHeaderBehavior;

  /**
   * Determines whether any query strings are included in the cache key and automatically included in requests that CloudFront sends to the origin.
   * @default CacheQueryStringBehavior.none()
   */
  readonly queryStringBehavior?: CacheQueryStringBehavior;

  /**
   * Whether to normalize and include the `Accept-Encoding` header in the cache key when the `Accept-Encoding` header is 'gzip'.
   * @default false
   */
  readonly enableAcceptEncodingGzip?: boolean;

  /**
   * Whether to normalize and include the `Accept-Encoding` header in the cache key when the `Accept-Encoding` header is 'br'.
   * @default false
   */
  readonly enableAcceptEncodingBrotli?: boolean;
}

/**
 * A Cache Policy configuration.
 *
 * @resource AWS::CloudFront::CachePolicy
 * @link https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
 */
@propertyInjectable
export class CachePolicy extends Resource implements ICachePolicy {
  /** Uniquely identifies this class. */
  public static readonly PROPERTY_INJECTION_ID: string = 'aws-cdk-lib.aws-cloudfront.CachePolicy';
  /**
   * This policy is designed for use with an origin that is an AWS Amplify web app.
   */
  public static readonly AMPLIFY = CachePolicy.fromManagedCachePolicy('2e54312d-136d-493c-8eb9-b001f22f67d2');
  /**
   * Optimize cache efficiency by minimizing the values that CloudFront includes in the cache key.
   * Query strings and cookies are not included in the cache key, and only the normalized 'Accept-Encoding' header is included.
   */
  public static readonly CACHING_OPTIMIZED = CachePolicy.fromManagedCachePolicy('658327ea-f89d-4fab-a63d-7e88639e58f6');
  /**
   * Optimize cache efficiency by minimizing the values that CloudFront includes in the cache key.
   * Query strings and cookies are not included in the cache key, and only the normalized 'Accept-Encoding' header is included.
   * Disables cache compression.
   */
  public static readonly CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS = CachePolicy.fromManagedCachePolicy('b2884449-e4de-46a7-ac36-70bc7f1ddd6d');
  /** Disables caching. This policy is useful for dynamic content and for requests that are not cacheable. */
  public static readonly CACHING_DISABLED = CachePolicy.fromManagedCachePolicy('4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
  /** Designed for use with an origin that is an AWS Elemental MediaPackage endpoint. */
  public static readonly ELEMENTAL_MEDIA_PACKAGE = CachePolicy.fromManagedCachePolicy('08627262-05a9-4f76-9ded-b50ca2e3a84f');

  /**
   * Designed for use with an origin that returns Cache-Control HTTP response headers and does not serve different content based on values present in the query string.
   */
  public static readonly USE_ORIGIN_CACHE_CONTROL_HEADERS = CachePolicy.fromManagedCachePolicy('83da9c7e-98b4-4e11-a168-04f0df8e2c65');

  /**
   * Designed for use with an origin that returns Cache-Control HTTP response headers and serves different content based on values present in the query string.
   */
  public static readonly USE_ORIGIN_CACHE_CONTROL_HEADERS_QUERY_STRINGS = CachePolicy.fromManagedCachePolicy('4cc15a8a-d715-48a4-82b8-cc0b614638fe');

  /** Imports a Cache Policy from its id. */
  public static fromCachePolicyId(scope: Construct, id: string, cachePolicyId: string): ICachePolicy {
    return new class extends Resource implements ICachePolicy {
      public readonly cachePolicyId = cachePolicyId;
    }(scope, id);
  }

  /** Use an existing managed cache policy. */
  private static fromManagedCachePolicy(managedCachePolicyId: string): ICachePolicy {
    return new class implements ICachePolicy {
      public readonly cachePolicyId = managedCachePolicyId;
    }();
  }

  public readonly cachePolicyId: string;

  constructor(scope: Construct, id: string, props: CachePolicyProps = {}) {
    super(scope, id, {
      physicalName: props.cachePolicyName,
    });
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    const cachePolicyName = props.cachePolicyName ?? `${Names.uniqueId(this).slice(0, 110)}-${Stack.of(this).region}`;

    if (!Token.isUnresolved(cachePolicyName) && !cachePolicyName.match(/^[\w-]+$/i)) {
      throw new ValidationError(`'cachePolicyName' can only include '-', '_', and alphanumeric characters, got: '${cachePolicyName}'`, this);
    }

    if (cachePolicyName.length > 128) {
      throw new ValidationError(`'cachePolicyName' cannot be longer than 128 characters, got: '${cachePolicyName.length}'`, this);
    }

    if (props.comment && !Token.isUnresolved(props.comment) && props.comment.length > 128) {
      throw new ValidationError(`'comment' cannot be longer than 128 characters, got: ${props.comment.length}`, this);
    }

    const minTtl = (props.minTtl ?? Duration.seconds(0)).toSeconds();
    let defaultTtl = (props.defaultTtl ?? Duration.days(1)).toSeconds();
    let maxTtl = (props.maxTtl ?? Duration.days(365)).toSeconds();

    withResolved(defaultTtl, minTtl, () => {
      defaultTtl = Math.max(defaultTtl, minTtl);
    });
    withResolved(maxTtl, defaultTtl, () => {
      maxTtl = Math.max(maxTtl, defaultTtl);
    });

    const resource = new CfnCachePolicy(this, 'Resource', {
      cachePolicyConfig: {
        name: cachePolicyName,
        comment: props.comment,
        minTtl,
        maxTtl,
        defaultTtl,
        parametersInCacheKeyAndForwardedToOrigin: this.renderCacheKey(props),
      },
    });

    this.cachePolicyId = resource.ref;
  }

  private renderCacheKey(props: CachePolicyProps): CfnCachePolicy.ParametersInCacheKeyAndForwardedToOriginProperty {
    const cookies = props.cookieBehavior ?? CacheCookieBehavior.none();
    const headers = props.headerBehavior ?? CacheHeaderBehavior.none();
    const queryStrings = props.queryStringBehavior ?? CacheQueryStringBehavior.none();

    return {
      cookiesConfig: {
        cookieBehavior: cookies.behavior,
        cookies: cookies.cookies,
      },
      headersConfig: {
        headerBehavior: headers.behavior,
        headers: headers.headers,
      },
      enableAcceptEncodingGzip: props.enableAcceptEncodingGzip ?? false,
      enableAcceptEncodingBrotli: props.enableAcceptEncodingBrotli ?? false,
      queryStringsConfig: {
        queryStringBehavior: queryStrings.behavior,
        queryStrings: queryStrings.queryStrings,
      },
    };
  }
}

/**
 * Determines whether any cookies in viewer requests are included in the cache key and
 * automatically included in requests that CloudFront sends to the origin.
 */
export class CacheCookieBehavior {
  /**
   * Cookies in viewer requests are not included in the cache key and
   * are not automatically included in requests that CloudFront sends to the origin.
   */
  public static none() { return new CacheCookieBehavior('none'); }

  /**
   * All cookies in viewer requests are included in the cache key and are automatically included in requests that CloudFront sends to the origin.
   */
  public static all() { return new CacheCookieBehavior('all'); }

  /**
   * Only the provided `cookies` are included in the cache key and automatically included in requests that CloudFront sends to the origin.
   */
  public static allowList(...cookies: string[]) {
    if (cookies.length === 0) {
      throw new UnscopedValidationError('At least one cookie to allow must be provided');
    }
    return new CacheCookieBehavior('whitelist', cookies);
  }

  /**
   * All cookies except the provided `cookies` are included in the cache key and
   * automatically included in requests that CloudFront sends to the origin.
   */
  public static denyList(...cookies: string[]) {
    if (cookies.length === 0) {
      throw new UnscopedValidationError('At least one cookie to deny must be provided');
    }
    return new CacheCookieBehavior('allExcept', cookies);
  }

  /** The behavior of cookies: allow all, none, an allow list, or a deny list. */
  public readonly behavior: string;
  /** The cookies to allow or deny, if the behavior is an allow or deny list. */
  public readonly cookies?: string[];

  private constructor(behavior: string, cookies?: string[]) {
    this.behavior = behavior;
    this.cookies = cookies;
  }
}

/**
 * Determines whether any HTTP headers are included in the cache key and automatically included in requests that CloudFront sends to the origin.
 */
export class CacheHeaderBehavior {
  /** HTTP headers are not included in the cache key and are not automatically included in requests that CloudFront sends to the origin. */
  public static none() { return new CacheHeaderBehavior('none'); }
  /** Listed headers are included in the cache key and are automatically included in requests that CloudFront sends to the origin. */
  public static allowList(...headers: string[]) {
    if (headers.length === 0) {
      throw new UnscopedValidationError('At least one header to allow must be provided');
    }
    return new CacheHeaderBehavior('whitelist', headers);
  }

  /** If no headers will be passed, or an allow list of headers. */
  public readonly behavior: string;
  /** The headers for the allow/deny list, if applicable. */
  public readonly headers?: string[];

  private constructor(behavior: string, headers?: string[]) {
    this.behavior = behavior;
    this.headers = headers;
  }
}

/**
 * Determines whether any URL query strings in viewer requests are included in the cache key
 * and automatically included in requests that CloudFront sends to the origin.
 */
export class CacheQueryStringBehavior {
  /**
   * Query strings in viewer requests are not included in the cache key and
   * are not automatically included in requests that CloudFront sends to the origin.
   */
  public static none() { return new CacheQueryStringBehavior('none'); }

  /**
   * All query strings in viewer requests are included in the cache key and are automatically included in requests that CloudFront sends to the origin.
   */
  public static all() { return new CacheQueryStringBehavior('all'); }

  /**
   * Only the provided `queryStrings` are included in the cache key and automatically included in requests that CloudFront sends to the origin.
   */
  public static allowList(...queryStrings: string[]) {
    if (queryStrings.length === 0) {
      throw new UnscopedValidationError('At least one query string to allow must be provided');
    }
    return new CacheQueryStringBehavior('whitelist', queryStrings);
  }

  /**
   * All query strings except the provided `queryStrings` are included in the cache key and
   * automatically included in requests that CloudFront sends to the origin.
   */
  public static denyList(...queryStrings: string[]) {
    if (queryStrings.length === 0) {
      throw new UnscopedValidationError('At least one query string to deny must be provided');
    }
    return new CacheQueryStringBehavior('allExcept', queryStrings);
  }

  /** The behavior of query strings -- allow all, none, only an allow list, or a deny list. */
  public readonly behavior: string;
  /** The query strings to allow or deny, if the behavior is an allow or deny list. */
  public readonly queryStrings?: string[];

  private constructor(behavior: string, queryStrings?: string[]) {
    this.behavior = behavior;
    this.queryStrings = queryStrings;
  }
}
