package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"log"
	"net"
	"os"
	"path"
	"strings"
)

func usage() {
	log.Fatal("usage: domas_file_server [port] [folder]")
}

func readFileName(c net.Conn) string {
	fileNameBytes := make([]byte, 260)
	io.ReadFull(c, fileNameBytes)
	fileName := strings.Trim(string(fileNameBytes), "\000")
	return fileName
}

func readFileSize(c net.Conn) int64 {
	fileSizeBytes := make([]byte, 8)
	io.ReadFull(c, fileSizeBytes)
	var fileSize int64
	binary.Read(bytes.NewBuffer(fileSizeBytes), binary.LittleEndian, &fileSize)
	return fileSize
}

func handleConnection(c net.Conn, folder string) {
	defer c.Close()

	fileName := readFileName(c)
	log.Printf("%v sent file name: %v\n", c.RemoteAddr(), fileName)

	fileSize := readFileSize(c)
	log.Printf("%v sent file size: %v\n", c.RemoteAddr(), fileSize)

	os.MkdirAll(folder, os.ModePerm)

	fullPath := path.Join(folder, fileName)
	file, err := os.Create(fullPath)
	if err != nil {
		log.Fatal("cannot create file " + fullPath)
	}

	buffer := make([]byte, 16*1024)
	var receivedBytes int64
	for {
		n, err := c.Read(buffer)
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("error %v", err)
		}
		receivedBytes += int64(n)
		file.Write(buffer[:n])
	}
	if receivedBytes == fileSize {
		log.Printf("%v received bytes: %v\n", c.RemoteAddr(), receivedBytes)
	} else {
		log.Printf("%v expected bytes: %v, but received %v\n", c.RemoteAddr(), fileSize, receivedBytes)
	}
}

func main() {
	if len(os.Args) < 3 {
		usage()
		os.Exit(1)
	}

	port := os.Args[1]
	folder := os.Args[2]

	ln, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatal("cannot listen to port " + port)
		os.Exit(2)
	}

	log.Printf("server listening at *:" + port)

	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		go handleConnection(conn, folder)
	}
}
