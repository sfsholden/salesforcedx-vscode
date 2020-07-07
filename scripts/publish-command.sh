curl -v -u ${CircleCIToken}: -X POST --header "Content-Type: application/json" -d '{
  "branch": "master",
  "parameters": {
    "deploy": true,
    "version": "patch"
  }
}' https://circleci.com/api/v2/project/gh/sfsholden/salesforcedx-vscode-sholden

#https://circleci.com/api/v2/project/gh/forcedotcom/lightning-language-server/pipeline
