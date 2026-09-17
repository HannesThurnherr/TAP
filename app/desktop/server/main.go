package main

import (
 "context"
 "embed"
 "encoding/json"
 "flag"
 "fmt"
 "io/fs"
 "net"
 "net/http"
 "os"
 "os/exec"
 "os/signal"
 "path"
 "runtime"
 "strconv"
 "strings"
 "syscall"
 "time"
)

//go:embed all:web
var files embed.FS
var version = "0.1.9"

func handler() http.Handler {
 web, _ := fs.Sub(files, "web")
 static := http.FileServer(http.FS(web))
 return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  // Only loopback names: reject DNS rebinding and cross-origin requests.
  host, _, err := net.SplitHostPort(r.Host)
  if err != nil { host = r.Host }
  if host != "127.0.0.1" && host != "localhost" { http.Error(w, "Local access only", http.StatusForbidden); return }
  if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host { http.Error(w, "Local access only", http.StatusForbidden); return }
  if r.Method != http.MethodGet && r.Method != http.MethodHead { w.Header().Set("Allow", "GET, HEAD"); http.Error(w, "Read-only server", http.StatusMethodNotAllowed); return }
  w.Header().Set("X-Content-Type-Options", "nosniff")
  w.Header().Set("X-Frame-Options", "SAMEORIGIN")
  w.Header().Set("Referrer-Policy", "no-referrer")
  if r.URL.Path == "/__tap/health" {
   w.Header().Set("Content-Type", "application/json")
   json.NewEncoder(w).Encode(map[string]string{"app":"tap-desktop", "version":version})
   return
  }
  clean := path.Clean("/"+r.URL.Path)
  for _, part := range strings.Split(r.URL.Path,"/") { if part == ".." || strings.HasPrefix(part,".") { http.NotFound(w,r); return } }
  if clean == "/" { w.Header().Set("Cache-Control", "no-store") } else { w.Header().Set("Cache-Control", "public, max-age=3600") }
  // No directory listings, arbitrary filesystem access, or source tree exposure.
  if clean != "/" { info, e := fs.Stat(web,strings.TrimPrefix(clean,"/")); if e != nil || info.IsDir() { http.NotFound(w,r); return } }
  static.ServeHTTP(w,r)
 })
}

func isTAP(url string) bool {
 client := &http.Client{Timeout: 800*time.Millisecond, CheckRedirect: func(*http.Request,[]*http.Request) error {return http.ErrUseLastResponse}}
 r,err := client.Get(url+"__tap/health"); if err != nil { return false }; defer r.Body.Close()
 var data struct {App string; Version string}; return json.NewDecoder(r.Body).Decode(&data)==nil && data.App=="tap-desktop" && data.Version==version
}

func openBrowser(url string) error {
 var cmd *exec.Cmd
 switch runtime.GOOS {
 case "darwin":
  browser := ""
  for _, name := range []string{"Google Chrome", "Microsoft Edge"} { if _,err:=os.Stat("/Applications/"+name+".app");err==nil {browser=name;break} }
  if browser!="" {cmd=exec.Command("open","-a",browser,url)} else {cmd=exec.Command("open",url)}
 case "windows": cmd=exec.Command("rundll32", "url.dll,FileProtocolHandler",url)
 default: cmd=exec.Command("xdg-open",url)
 }
 return cmd.Run()
}

func main() {
 port := flag.Int("port",8780,"Loopback port (0 chooses an available port)")
 noOpen := flag.Bool("no-open",false,"Do not open the browser")
 parent := flag.Int("parent",0,"Exit if the owning launcher exits")
 flag.Parse()
 addr := "127.0.0.1:"+strconv.Itoa(*port)
 ln,err := net.Listen("tcp4",addr)
 if err!=nil && *port!=0 {
  url:="http://"+addr+"/"
  if isTAP(url) {fmt.Println("TAP_REUSED="+url); if !*noOpen {openBrowser(url)}; return}
  ln,err=net.Listen("tcp4","127.0.0.1:0")
 }
 if err!=nil {fmt.Fprintln(os.Stderr,"TAP:",err);os.Exit(1)}
 url:="http://"+ln.Addr().String()+"/"
 srv:= &http.Server{Handler:handler(),ReadHeaderTimeout:5*time.Second,IdleTimeout:60*time.Second}
 done:=make(chan os.Signal,1);signal.Notify(done,os.Interrupt,syscall.SIGTERM)
 if *parent>0 {go func(){for {time.Sleep(time.Second);if os.Getppid()!=*parent {done<-syscall.SIGTERM;return}}}()}
 go func(){<-done;ctx,cancel:=context.WithTimeout(context.Background(),2*time.Second);defer cancel();srv.Shutdown(ctx)}()
 fmt.Println("TAP_URL="+url)
 fmt.Printf("TAP %s — %s\nKeep this window open while using TAP. Close it or press Ctrl+C to quit.\n",version,url)
 if !*noOpen {go func(){if e:=openBrowser(url);e!=nil {fmt.Fprintln(os.Stderr,"Open this address in your browser:",url)}}()}
 if e:=srv.Serve(ln);e!=nil && e!=http.ErrServerClosed {fmt.Fprintln(os.Stderr,e);os.Exit(1)}
}
