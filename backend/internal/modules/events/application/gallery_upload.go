package application

import (
	"context"
	"os"
	"path/filepath"
	"time"

	authdomain "myticketin/internal/modules/auth/domain"
	"myticketin/internal/modules/events/domain"
	platdb "myticketin/internal/platform/db"
)

const maxGalleryBytes = 5 << 20

func (s *Service) SaveGalleryImage(ctx context.Context, actor authdomain.User, image []byte, ip string) (string, error) {
	if _, err := s.requireOrg(ctx, actor); err != nil {
		return "", err
	}
	if err := s.limit(ctx, "event", actor.ID, ip, 40, time.Hour); err != nil {
		return "", err
	}
	if len(image) == 0 || len(image) > maxGalleryBytes {
		return "", domain.ErrImageTooLarge
	}
	mime, err := DetectImageMIME(image)
	if err != nil {
		return "", domain.ErrImageTypeInvalid
	}
	dir := s.GalleryDir
	if dir == "" {
		return "", domain.ErrStorageNotConfigured
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", domain.ErrStorageNotConfigured
	}
	id, err := platdb.NewID()
	if err != nil {
		return "", err
	}
	name := id + extForMIME(mime)
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, image, 0o640); err != nil {
		return "", domain.ErrStorageNotConfigured
	}
	return "/uploads/gallery/" + name, nil
}

func extForMIME(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}
