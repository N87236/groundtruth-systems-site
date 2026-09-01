import { CfnOutput, Duration, Stack, StackProps, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DeploymentRolesStackProps extends StackProps {
  readonly githubOwner: string;
  readonly githubRepository: string;
}

export class GroundTruthDeploymentRolesStack extends Stack {
  public constructor(scope: Construct, id: string, props: DeploymentRolesStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const repository = `${props.githubOwner}/${props.githubRepository}`;

    const createRole = (
      roleId: string,
      roleName: string,
      subject: string | string[],
    ): iam.Role => {
      const principal = new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub': subject,
        },
      });
      const role = new iam.Role(this, roleId, {
        roleName,
        assumedBy: principal,
        description: `GitHub OIDC entry role for ${repository}`,
        maxSessionDuration: Duration.hours(1),
      });
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: 'AssumeGroundTruthCdkBootstrapRoles',
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
            `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
            `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-image-publishing-role-${this.account}-${this.region}`,
            `arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
          ],
        }),
      );
      return role;
    };

    const devRole = createRole(
      'DevDeployRole',
      'GroundTruthDevDeployRole',
      `repo:${repository}:environment:development`,
    );
    const prodRole = createRole(
      'ProdDeployRole',
      'GroundTruthProdDeployRole',
      `repo:${repository}:environment:production`,
    );

    new CfnOutput(this, 'DevDeployRoleArn', { value: devRole.roleArn });
    new CfnOutput(this, 'ProdDeployRoleArn', { value: prodRole.roleArn });
  }
}
