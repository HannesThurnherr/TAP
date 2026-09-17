package main

import (
 "net/http/httptest"
 "testing"
 "strings"
)
func TestBundledRoutes(t *testing.T) {
 for _,tc:=range []struct{path string;status int;contains string}{
  {"/",200,"TAP"},{"/__tap/health",200,"tap-desktop"},{"/areas/aeuli/dem.json",200,"E0"},{"/draco/draco_decoder.wasm",200,""},{"/areas/",404,""},{"/missing.js",404,""},{"/../go.mod",404,""},{"/.env",404,""},
 } {r:=httptest.NewRequest("GET","http://127.0.0.1:8780"+tc.path,nil);w:=httptest.NewRecorder();handler().ServeHTTP(w,r);if w.Code!=tc.status || !strings.Contains(w.Body.String(),tc.contains){t.Errorf("%s: %d",tc.path,w.Code)}}
}
func TestLocalReadOnly(t *testing.T) {
 for _,tc:=range []struct{method,host,origin string;status int}{
  {"GET","evil.example:8780","",403},{"POST","127.0.0.1:8780","",405},{"GET","127.0.0.1:8780","https://evil.example",403},{"GET","127.0.0.1:8780","http://127.0.0.1:8780",200},
 } {r:=httptest.NewRequest(tc.method,"http://"+tc.host+"/",nil);r.Header.Set("Origin",tc.origin);w:=httptest.NewRecorder();handler().ServeHTTP(w,r);if w.Code!=tc.status {t.Errorf("%+v: %d",tc,w.Code)}}
}
func TestDemRangeRequests(t *testing.T){r:=httptest.NewRequest("GET","http://127.0.0.1:8780/areas/aeuli/dem.bin",nil);r.Header.Set("Range","bytes=0-15");w:=httptest.NewRecorder();handler().ServeHTTP(w,r);if w.Code!=206||w.Body.Len()!=16 {t.Fatalf("range: %d, %d bytes",w.Code,w.Body.Len())}}
