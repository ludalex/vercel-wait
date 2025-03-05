# vercel-wait

This GitHub Action waits for a Vercel deployment to finish. It finds a
deployment by commit SHA and waits for it to reach a ready state.

## Inputs

| Name                | Description                                                           | Required | Default |
| ------------------- | --------------------------------------------------------------------- | -------- | ------- |
| `token`             | Vercel token (from https://vercel.com/account/tokens)                 | Yes      |         |
| `project-id`        | Vercel project ID (from https://vercel.com/<team>/<project>/settings) | Yes      |         |
| `team-id`           | Vercel team ID (from https://vercel.com/teams/<team>/settings)        | Yes      |         |
| `timeout`           | Timeout in seconds                                                    | No       | 600     |
| `delay`             | Delay in seconds between API requests to Vercel                       | No       | 5       |
| `initial-delay`     | Delay in seconds before starting the request loop                     | No       | 10      |
| `sha`               | The commit SHA to wait for                                            | Yes      |         |
| `canceled-as-ready` | Treat 'CANCELED' deployments as ready                                 | No       | true    |

## Outputs

| Name                     | Description                |
| ------------------------ | -------------------------- |
| `deployment-id`          | The deployment ID          |
| `deployment-url`         | The deployment URL         |
| `deployment-state`       | The deployment state       |
| `deployment-alias-error` | The deployment alias error |

## Example Usage

```yaml
- name: Wait for Vercel Deployment
  uses: ludalex/vercel-wait@v1
  with:
    token: ${{ secrets.VERCEL_TOKEN }}
    project-id: ${{ vars.VERCEL_PROJECT_ID }}
    team-id: ${{ vars.VERCEL_TEAM_ID }}
    sha: ${{ github.sha }}
    timeout: 900
    canceled-as-ready: 'true'
```

## How it works

1. The action first searches for a deployment with the specified commit SHA
2. Once found, it monitors the deployment state until it reaches a ready state
   (READY or CANCELED if `canceled-as-ready` is true)
3. If the deployment is not found or does not reach a ready state within the
   timeout period, the action fails
