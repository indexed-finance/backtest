import express from 'express';

export async function startRedirectServer() {
  const httpServer = express();

  httpServer.get('*', function(req, res) {  
    res.redirect('https://' + req.headers.host + req.url);
  });

  httpServer.listen(80, () => console.log('Started redirect server.'));
}