/**
 * Deploy the triggers to the server
 *
 * - Check workflow id to deploy to (read from floww.yaml)
 *    - if not provided, ask user to select a workflow from list or create new one
 *    - if provided, check if workflow exists
 * 
 * - Update the runtime if needed
 *    - build the runtime docker image
 *    - get token to push to docker registry
 *    - push the runtime docker image to the docker registry
 *    - create new runtime in backend
 *
 * - Update the triggers
 *    - post request to backend to update code
 */
export function deployCommand() {
    // use ink for interactive prompts


}
