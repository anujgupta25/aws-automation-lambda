const {
    AmplifyClient,
    GetJobCommand,
    GetAppCommand,
  } = require("@aws-sdk/client-amplify");
  const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");
  const mimemessage = require("mimemessage");
  const fs = require("fs");
  const https = require("https");
  
  exports.handler = async (event) => {
    
    const { appId, branchName, jobId, jobStatus } = event.detail;
  
    var msg, alternateEntity, htmlEntity, fileEntity;
  
    if (!appId || !branchName || !jobId || !jobStatus) {
      throw Error("parameters not satisfied.");
    }
  
    const amplifyClient = new AmplifyClient({
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
      region: process.env.DEFAULT_REGION,
    });
  
    const sesClient = new SESClient({
      accessKeyId: process.env.ACCESS_KEY_ID,
      secretAccessKey: process.env.SECRET_ACCESS_KEY,
      region: process.env.DEFAULT_REGION,
    });
  
    const getJob = async () => {
      const command = new GetJobCommand({
        appId,
        branchName,
        jobId,
      });
      const jobInfo = await amplifyClient.send(command);
      return jobInfo.job;
    };
  
    const getApp = async () => {
      const command = new GetAppCommand({
        appId,
      });
      const appInfo = await amplifyClient.send(command);
      return appInfo.app;
    };
  
    const job = await getJob();
    const app = await getApp();
  
    // creating mimemessage of RawEmail
    msg = mimemessage.factory({
      contentType: "multipart/mixed",
      body: [],
    });
    msg.header("Subject", `#${jobId} - ${app?.name} build status`);
    alternateEntity = mimemessage.factory({
      contentType: "multipart/alternate",
      body: [],
    });
    htmlEntity = mimemessage.factory({
      contentType: "text/html;charset=utf-8",
      body: ` <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta http-equiv="X-UA-Compatible" content="IE=edge" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title></title>
              <style>
                html {
                  font-family: sans-serif;
                }
                p {
                  font-weight: 12px;
                }
                .container {
                  display: flex;
                  font-size: 16px;
                  justify-content: center !important;
                }
                .inner {
                  text-align: center;
                  background: #f9f9f9;
                  box-shadow : 1px 1px 5px 1px rgba(0,0,0,0.1);
                  width:100%;
                  padding: 8px
                }
                button {
                  background: #000;
                  color: #fff;
                  width: 100px;
                  height: 40px;
                  border: none;
                  cursor: pointer;
                }
                .heading{
                  margin-top:40px;
                }
                .success{
                  color : green;
                }
                .started{
                  color : #d3be2a;
                }
                .failed{
                  color : red;
                }
                .note{
                  margin-top : 50px;
                  font-size : 14px;
                  color : grey;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="inner">
                  <h2>Amplify build information:</h2>
                  <br />
                  <p>Build ID: <b>#${jobId}</
                  b></p>
                  <p>App name: <b>${app?.name}</b></p>
                  <p>Build Status: ${
                    jobStatus == "SUCCEED"
                      ? '<b class="success">Successful</b>'
                      : jobStatus == "FAILED"
                      ? '<b class="failed">Failed</b>'
                      : jobStatus == "STARTED" || jobStatus == "RUNNING"
                      ? `<b class="started">${jobStatus}</b>`
                      : "Not found"
                  }</p>
                  <h3>Click on the link below to access the app :</h3>
                  <a href=https://${app?.productionBranch?.branchName}.${app?.appId}.amplifyapp.com/" target="_blank" ><button>Go to App</button></a>
                  <h3 class="heading">Github repository information:</h3>
                  <p>Branch name: <b>${app?.productionBranch?.branchName}</b></p>
                  <p>Latest commit ID: <b>${job?.summary?.commitId}</b></p>
                  <p class="note"> ** Please find the attached build log file. **</p>
                </div>
              </div>
            </body>
          </html>`
    });
  
    let base64String;
    
    // create write stream
    const str = fs.createWriteStream("/tmp/out.txt");
  
    // Requesting file using https request, and moving to the pipe stream
    await new Promise((resolve) => {
      https.get(job?.steps[0]?.logUrl, (res) => {
        res.pipe(str);
  
        // Reading the file when the Pipe processed the file, and convert the file to Base64
        str.on("finish", () => {
          str.close();
          const dataa = fs.readFileSync("/tmp/out.txt");
          const b64String = Buffer.from(dataa).toString("base64");
          base64String = b64String;
  
          //  Using the Base64 file as attachment body
          fileEntity = mimemessage.factory({
            contentType: "text/plain",
            contentTransferEncoding: "base64",
            body: base64String,
          });
  
          fileEntity.header(
            "Content-Disposition",
            'attachment ;filename="logs.txt"'
          );
  
          // Pushing parameters to the parent mimemessage entity
          alternateEntity.body.push(htmlEntity);
  
          msg.body.push(alternateEntity);
  
          msg.body.push(fileEntity);
  
          // Finally, Trigger the sendRawEmail
          const command = new SendRawEmailCommand({
            Destinations: [process.env.PARTICIPANTS],
            RawMessage: {
              Data: Buffer.from(msg.toString()),
            },
            Source: "anujgupta@cedcommerce.com",
          });
          
          sesClient
            .send(command)
            .then((res) => console.log("success", res.MessageId));
        });
      });
    });
  
    return null;
  };