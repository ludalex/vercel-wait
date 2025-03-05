import * as core from '@actions/core';

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    // Get inputs
    const token = core.getInput('token', { required: true });
    const projectId = core.getInput('project-id', { required: true });
    const teamId = core.getInput('team-id', { required: true });
    const timeout = parseInt(core.getInput('timeout') || '600', 10);
    const delay = parseInt(core.getInput('delay') || '10', 10);
    const initialDelay = parseInt(core.getInput('initial-delay') || '5', 10);
    const sha = core.getInput('sha', { required: true });
    const canceledAsReady =
      (core.getInput('canceled-as-ready') || 'true').toLowerCase() === 'true';

    // Set up fetch headers
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    // Wait for initial delay
    core.debug(`Waiting for initial delay of ${initialDelay} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, initialDelay * 1000));

    const startTime = Date.now();
    const timeoutMs = timeout * 1000;

    // Phase 1: Find the deployment ID by commit SHA
    core.info(`Looking for deployment with commit SHA: ${sha}`);
    let deploymentId = null;
    let initialRequestUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=100`;
    let requestUrl = initialRequestUrl;

    while (!deploymentId && Date.now() - startTime < timeoutMs) {
      try {
        core.debug(`Requesting deployments from: ${requestUrl}`);
        const response = await fetch(requestUrl, { headers });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Check for errors
        if (data.error) {
          if (data.error.code === 'forbidden') {
            const errorMessage = data.error.message;
            const invalidToken = data.error.invalidToken;
            let combinedMessage = errorMessage;

            if (invalidToken) {
              combinedMessage += ' (Invalid token detected.)';
            }

            core.setFailed(combinedMessage);
            return;
          }
        }

        // Find deployment with matching SHA
        const deployment = data.deployments.find(
          (d) => d.meta && d.meta.githubCommitSha === sha,
        );

        if (deployment) {
          deploymentId = deployment.uid;
          core.info(`Deployment found: ${deploymentId}`);

          // Check if deployment is already in ERROR state
          if (deployment.state === 'ERROR' || deployment.status === 'ERROR') {
            core.setFailed(
              `Deployment ${deploymentId} is in ERROR state. Failing immediately.`,
            );
            return;
          }

          break;
        }

        // Handle pagination
        const next = data.pagination?.next;
        if (next) {
          if (requestUrl.includes('&until=')) {
            // Replace existing until parameter
            requestUrl = requestUrl.replace(/until=[0-9]*/, `until=${next}`);
          } else {
            // Add until parameter
            requestUrl = `${requestUrl}&until=${next}`;
          }
        } else {
          requestUrl = initialRequestUrl;
        }

        // Wait before next request
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      } catch (error) {
        core.warning(`Failed to get deployments: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }
    }

    if (!deploymentId) {
      core.setFailed(
        `Deployment with commit SHA ${sha} was not found within the timeout period of ${timeout} seconds.`,
      );
      return;
    }

    // Phase 2: Monitor the deployment state
    core.info(`Monitoring deployment state for: ${deploymentId}`);
    let deploymentReady = false;
    let deploymentState = '';
    let deploymentUrl = '';
    let aliasError = '';

    const deploymentApiUrl = `https://api.vercel.com/v13/deployments/${deploymentId}`;

    while (!deploymentReady && Date.now() - startTime < timeoutMs) {
      try {
        core.debug(`Checking deployment state from: ${deploymentApiUrl}`);
        const response = await fetch(deploymentApiUrl, { headers });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        deploymentState = data.status;
        core.debug(`Deployment state: ${deploymentState}`);

        // Immediately fail if deployment is in ERROR state
        if (deploymentState === 'ERROR') {
          core.setFailed(`Deployment ${deploymentId} is in ERROR state.`);
          return;
        }

        if (
          deploymentState === 'READY' ||
          (canceledAsReady && deploymentState === 'CANCELED')
        ) {
          deploymentReady = true;
          deploymentUrl = data.url;
          aliasError = data.aliasError || '';

          core.debug(`Deployment is ready with state: ${deploymentState}`);
          break;
        }

        // Wait before next request
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      } catch (error) {
        core.warning(`Failed to get deployment status: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
      }
    }

    if (!deploymentReady) {
      core.setFailed(
        `Deployment did not reach a ready state within the specified timeout of: ${timeout} seconds`,
      );
      return;
    }

    // Set outputs
    core.setOutput('id', deploymentId);
    core.setOutput('url', deploymentUrl);
    core.setOutput('state', deploymentState);
    core.setOutput('alias_error', aliasError);

    core.info(`Deployment is ready: ${deploymentUrl}`);
  } catch (error) {
    core.setFailed(`Action failed with error: ${error.message}`);
  }
}
