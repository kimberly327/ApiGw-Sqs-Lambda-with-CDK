import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ApiGW from 'aws-cdk-lib/aws-apigateway';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class SecondCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const dlq = new sqs.Queue(this, 'DLQueue', {
      queueName: 'DLQQueue'
    });
    const queue = new sqs.Queue(this, 'Queue', {
      queueName: 'SimpleQueue',
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3
      }
    });

    const integrationRole = new iam.Role(this, 'integration-role', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    queue.grantSendMessages(integrationRole);

    const lambda_function = new lambda.Function(this, 'Function', {
      functionName: 'LambdaConsumer',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.lambdaHandler',
      code: lambda.Code.fromAsset("src"),
    });

    lambda_function.addEventSource( 
      new SqsEventSource(queue, {
        batchSize: 10
      })
    );

    const sendMessageIntegration = new ApiGW.AwsIntegration({
      service: 'sqs',
      path: `${process.env.CDK_DEFAULT_ACCOUNT}/${queue.queueName}`,
      integrationHttpMethod: 'POST',
      options: {
        credentialsRole: integrationRole,
        requestParameters: {
          'integration.request.header.Content-Type': `'application/x-www-form-urlencoded'`,
        },
        requestTemplates: {
          'application/json': 'Action=SendMessage&MessageBody=$input.body',
        },
        integrationResponses: [
          {
            statusCode: '200',
          },
          {
            statusCode: '400',
          },
          {
            statusCode: '500',
          }
        ]
      },
    });
    
    const api = new ApiGW.RestApi(this, 'api', {});
    api.root.addMethod('POST', sendMessageIntegration, {
      methodResponses: [
        {
          statusCode: '400',
        },
        {
          statusCode: '200',
        },
        {
          statusCode: '500',
        }
      ]
    });
  }
}
