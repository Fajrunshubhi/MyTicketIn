package env

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

func applyDotEnv() {
	wd, err := os.Getwd()
	if err != nil {
		return
	}
	candidates := []string{
		filepath.Join(wd, ".env.local"),
		filepath.Join(wd, ".env"),
		filepath.Join(wd, "..", ".env.local"),
		filepath.Join(wd, "..", ".env"),
		filepath.Join(wd, "..", "..", ".env.local"),
	}
	for _, path := range candidates {
		loadEnvFile(path)
	}
}

func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, value)
	}
}
